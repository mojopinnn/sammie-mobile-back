import React, { useState, useRef, useEffect } from "react";
import { 
  Play, Pause, Upload, Check, Settings, Layers, Video, Terminal, 
  Activity, Eye, Download, Code, ChevronDown, ChevronUp, RefreshCw,
  Smartphone, Trash2, Sliders, Shield, Film, HelpCircle, Sparkles
} from "lucide-react";

interface MaskPoint {
  x: number;
  y: number;
  type: "positive" | "negative";
}

export default function App() {
  const [activeTab, setActiveTab] = useState<"endpoints" | "simulator">("simulator");
  const [expandedEndpoint, setExpandedEndpoint] = useState<string | null>("/upload-video");
  const [testStatus, setTestStatus] = useState<string>("Ready");
  
  // Mobile Simulator States
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string>("");
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [points, setPoints] = useState<MaskPoint[]>([]);
  const [activePointType, setActivePointType] = useState<"positive" | "negative">("positive");
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [processStep, setProcessStep] = useState<string>("");
  const [progress, setProgress] = useState<number>(0);
  const [simulatedMode, setSimulatedMode] = useState<"normal" | "matte" | "removed">("normal");
  const [logs, setLogs] = useState<string[]>([
    "Sammie Mobile Engine client initialized.",
    "Awaiting raw video stream input..."
  ]);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const endpoints = [
    {
      path: "/upload-video",
      method: "POST",
      desc: "Upload raw video, decode frames, and initialize the SAM2 predictor.",
      requestBody: {
        type: "multipart/form-data",
        fields: {
          file: "file (video format e.g. .mp4, .mov)"
        }
      },
      responseBody: {
        status: "success",
        video_path: "temp_uploads/example.mp4",
        width: 1920,
        height: 1080,
        fps: 24.0,
        total_frames: 120
      },
      curl: `curl -X POST "http://localhost:8080/upload-video" \\
  -H "accept: application/json" \\
  -H "Content-Type: multipart/form-data" \\
  -F "file=@my_video.mp4"`
    },
    {
      path: "/segment-point",
      method: "POST",
      desc: "Perform interactive point-based mask editing on a specific frame index.",
      requestBody: {
        type: "application/json",
        fields: {
          frame_number: "int (0-based frame index)",
          object_id: "int (mask identifier, default: 0)",
          coords: "array of [x, y] coordinates (e.g. [[450, 320]])",
          labels: "array of ints (1: positive point, 0: negative background point)"
        }
      },
      responseBody: {
        status: "success",
        frame_number: 10,
        object_id: 0,
        points_count: 1
      },
      curl: `curl -X POST "http://localhost:8080/segment-point" \\
  -H "accept: application/json" \\
  -H "Content-Type: application/json" \\
  -d '{"frame_number": 10, "object_id": 0, "coords": [[450, 320]], "labels": [1]}'`
    },
    {
      path: "/track-objects",
      method: "POST",
      desc: "Propagate tracked points/masks forward and backward over the video frames.",
      requestBody: {
        type: "application/json",
        fields: {
          start_frame: "int (optional, starting frame index for propagation)",
          end_frame: "int (optional, ending frame index for propagation)"
        }
      },
      responseBody: {
        status: "success",
        propagated: true
      },
      curl: `curl -X POST "http://localhost:8080/track-objects" \\
  -H "accept: application/json" \\
  -H "Content-Type: application/json" \\
  -d '{"start_frame": 0, "end_frame": 120}'`
    },
    {
      path: "/run-matting",
      method: "POST",
      desc: "Perform fine-grained alpha matting propagation using MatAnyone models.",
      requestBody: {
        type: "application/json",
        fields: {
          combined: "bool (optional, run combined matting for multi-object, default: false)"
        }
      },
      responseBody: {
        status: "success",
        matted: true
      },
      curl: `curl -X POST "http://localhost:8080/run-matting" \\
  -H "accept: application/json" \\
  -H "Content-Type: application/json" \\
  -d '{"combined": false}'`
    },
    {
      path: "/run-removal",
      method: "POST",
      desc: "Perform high-quality background inpainting / object removal on segmented regions.",
      requestBody: {
        type: "application/json",
        fields: {}
      },
      responseBody: {
        status: "success"
      },
      curl: `curl -X POST "http://localhost:8080/run-removal" \\
  -H "accept: application/json" \\
  -H "Content-Type: application/json"`
    },
    {
      path: "/preview",
      method: "GET",
      desc: "Retrieve real-time JPEG rendered previews of segmentation and matting results.",
      requestBody: {
        type: "URL Query Parameters",
        fields: {
          frame_number: "int (frame index)",
          view_mode: "string (Segmentation-Edit, Segmentation-BGcolor, Matting-Matte, ObjectRemoval, None)"
        }
      },
      responseBody: "Binary image/jpeg stream",
      curl: `curl -o preview_frame_10.jpg "http://localhost:8080/preview?frame_number=10&view_mode=Segmentation-Edit"`
    }
  ];

  const toggleEndpoint = (path: string) => {
    setExpandedEndpoint(expandedEndpoint === path ? null : path);
  };

  const addLog = (msg: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [`[${timestamp}] ${msg}`, ...prev]);
  };

  // Handle Simulator Upload
  const handleSimulatorFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setVideoFile(file);
      const url = URL.createObjectURL(file);
      setVideoUrl(url);
      setPoints([]);
      setSimulatedMode("normal");
      addLog(`Selected local video: "${file.name}" (${(file.size / (1024*1024)).toFixed(2)} MB)`);
      addLog("Ready to segment and track on SAM2 & MatAnyone core.");
    }
  };

  // Play / Pause video inside the smartphone viewport
  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
        setIsPlaying(false);
        addLog("Video playback paused.");
      } else {
        videoRef.current.play();
        setIsPlaying(true);
        addLog("Video playback started.");
      }
    }
  };

  // Interactive masking point selector (click on video container)
  const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!videoUrl) return;
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      const newPoint: MaskPoint = { x, y, type: activePointType };
      setPoints([...points, newPoint]);
      addLog(`Added ${activePointType.toUpperCase()} interactive tracking coordinate: [x: ${Math.round(x)}%, y: ${Math.round(y)}%]`);
    }
  };

  const clearPoints = () => {
    setPoints([]);
    setSimulatedMode("normal");
    addLog("Cleared all interactive tracking coordinates.");
  };

  // Process simulations
  const triggerTracking = () => {
    if (!videoUrl) {
      addLog("Error: No video loaded to run tracker propagation.");
      return;
    }
    setIsProcessing(true);
    setProcessStep("Propagating SAM2 Mask Forward/Backward...");
    setProgress(15);
    addLog("POST /track-objects - Dispatching propagation pipeline...");

    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setIsProcessing(false);
          setProcessStep("");
          addLog("POST /track-objects - 100% Propagation completed successfully across all frames.");
          return 100;
        }
        addLog(`Propagating masks on frame ${Math.round(prev * 1.2)} / 120...`);
        return prev + 17;
      });
    }, 400);
  };

  const triggerMatting = () => {
    if (!videoUrl) {
      addLog("Error: Load video first to test alpha matting.");
      return;
    }
    setIsProcessing(true);
    setProcessStep("Extracting high-fidelity Alpha Matte...");
    setProgress(20);
    addLog("POST /run-matting - Running MatAnyone temporal edge transparency extraction...");

    setTimeout(() => {
      setProgress(60);
      addLog("Refining fine boundary transparency structures using VGG/SR architecture...");
    }, 600);

    setTimeout(() => {
      setIsProcessing(false);
      setProcessStep("");
      setSimulatedMode("matte");
      addLog("POST /run-matting - Finished. Transparency Alpha mask activated in viewport!");
    }, 1300);
  };

  const triggerRemoval = () => {
    if (!videoUrl) {
      addLog("Error: Load video first to test removal inpainting.");
      return;
    }
    setIsProcessing(true);
    setProcessStep("Running MiniMax Inpainting Remover...");
    setProgress(10);
    addLog("POST /run-removal - Tiling background frames for diffusion-based regions...");

    setTimeout(() => {
      setProgress(50);
      addLog("Synthesizing background textures from spatial neighbor keys...");
    }, 500);

    setTimeout(() => {
      setIsProcessing(false);
      setProcessStep("");
      setSimulatedMode("removed");
      addLog("POST /run-removal - Object removal inpainting complete!");
    }, 1200);
  };

  return (
    <div className="min-h-screen bg-[#FAF7F0] text-[#2C3322] font-sans antialiased">
      {/* Top Main Navigation Header */}
      <header className="border-b border-[#E1E5D8] bg-[#FAF9F5] px-8 py-5 flex flex-col md:flex-row items-center justify-between shadow-sm space-y-4 md:space-y-0">
        <div className="flex items-center space-x-3">
          <Smartphone className="h-6 w-6 text-[#5B6D45]" />
          <div>
            <h1 className="text-xl font-bold tracking-tight text-[#2C3322] flex items-center">
              Sammie Mobile <span className="ml-2 text-xs font-semibold bg-[#C83232]/10 text-[#C83232] px-2.5 py-0.5 rounded-full border border-[#C83232]/20 font-mono">DEVELOPER WORKSPACE</span>
            </h1>
            <p className="text-xs text-[#5C6550] font-medium">Headless Video Segmentation, Propagation & Alpha Matting Console</p>
          </div>
        </div>
        
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2 text-xs text-[#4A5538] bg-[#FFFFFF] px-3.5 py-2 rounded-lg border border-[#E1E5D8] shadow-xs">
            <span className="h-2 w-2 rounded-full bg-[#C83232] animate-pulse"></span>
            <span className="font-semibold tracking-wider font-mono">FASTAPI CORE ONLINE : PORT 8080</span>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto p-4 md:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: API Specification & Sandbox Controller */}
        <div className="lg:col-span-7 space-y-6">
          {/* Main Workspace Mode Tabs */}
          <div className="flex space-x-1 bg-[#FAF9F5] p-1.5 rounded-xl border border-[#D5DAC9] max-w-md shadow-sm">
            <button
              onClick={() => setActiveTab("simulator")}
              className={`flex-1 flex items-center justify-center space-x-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                activeTab === "simulator" 
                  ? "bg-[#5B6D45] text-white shadow-md" 
                  : "text-[#5C6550] hover:text-[#2C3322] hover:bg-[#F2F4EB]"
              }`}
            >
              <Smartphone className="h-4 w-4" />
              <span>Interactive Simulator</span>
            </button>
            <button
              onClick={() => setActiveTab("endpoints")}
              className={`flex-1 flex items-center justify-center space-x-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                activeTab === "endpoints" 
                  ? "bg-[#5B6D45] text-white shadow-md" 
                  : "text-[#5C6550] hover:text-[#2C3322] hover:bg-[#F2F4EB]"
              }`}
            >
              <Terminal className="h-4 w-4" />
              <span>Endpoint Spec (REST API)</span>
            </button>
          </div>

          {/* SIMULATOR TAB VIEW */}
          {activeTab === "simulator" && (
            <div className="space-y-6">
              {/* Context Explanation */}
              <div className="bg-[#FFFFFF] p-6 rounded-2xl border border-[#E3E8DB] shadow-sm">
                <div className="flex items-center space-x-2 mb-2">
                  <span className="text-[#C83232] text-xs font-bold uppercase tracking-wider font-mono px-2 py-0.5 bg-[#C83232]/10 border border-[#C83232]/20 rounded-md">How to Test</span>
                </div>
                <h2 className="text-lg font-bold text-[#2C3322]">Interactive Pipeline Testing</h2>
                <p className="text-sm text-[#5C6550] mt-1.5 leading-relaxed">
                  This console provides an interactive frontend simulator representing the <strong>Sammie Mobile App Client</strong>. 
                  Below, upload a video file, click inside the preview screen to register coordinates, and run propagation/matting logic to simulate headless REST calls in action.
                </p>
              </div>

              {/* Core Simulator Controls */}
              <div className="bg-[#FFFFFF] p-6 rounded-2xl border border-[#E3E8DB] shadow-sm space-y-6">
                <div className="flex justify-between items-center border-b border-[#F0F2EB] pb-4">
                  <h3 className="font-bold text-[#2C3322] flex items-center">
                    <Sliders className="h-4 w-4 mr-2 text-[#5B6D45]" />
                    Simulator Controller
                  </h3>
                  <span className="text-xs font-semibold font-mono text-[#5C6550]">LOCAL ENGINE STATUS: ACTIVE</span>
                </div>

                {/* 1. File Upload Selector */}
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-[#434E35] uppercase tracking-wider">
                    Step 1: Load Test Media
                  </label>
                  <div className="flex items-center space-x-3">
                    <label className="cursor-pointer bg-[#5B6D45] hover:bg-[#434E35] text-xs text-white font-bold px-4 py-2.5 rounded-lg transition-all shadow-md flex items-center space-x-2">
                      <Upload className="h-3.5 w-3.5" />
                      <span>Select Local Video</span>
                      <input type="file" accept="video/*" onChange={handleSimulatorFile} className="hidden" />
                    </label>
                    <span className="text-xs text-[#5C6550] font-medium truncate max-w-xs">
                      {videoFile ? videoFile.name : "No video loaded. Select MP4/MOV to activate."}
                    </span>
                  </div>
                </div>

                {/* 2. Interactive Coordinate Tools */}
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-bold text-[#434E35] uppercase tracking-wider">
                      Step 2: Interactive Segmentation (SAM2 Coordinate Setter)
                    </label>
                    {points.length > 0 && (
                      <button 
                        onClick={clearPoints}
                        className="text-xs font-bold text-[#C83232] hover:underline flex items-center"
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1" />
                        Clear points ({points.length})
                      </button>
                    )}
                  </div>

                  <p className="text-xs text-[#5C6550] leading-relaxed">
                    Choose point type, then tap on the mobile viewport preview in the right column to assign segmentation guides.
                  </p>

                  <div className="flex space-x-3">
                    <button
                      onClick={() => setActivePointType("positive")}
                      className={`flex-1 flex items-center justify-center space-x-2 py-2.5 rounded-xl border text-xs font-bold transition-all ${
                        activePointType === "positive"
                          ? "bg-[#FAF9F5] border-[#5B6D45] text-[#2C3322] shadow-sm"
                          : "border-[#E1E5D8] text-[#5C6550] bg-white hover:bg-[#F2F4EB]"
                      }`}
                    >
                      <span className="h-2 w-2 rounded-full bg-[#5B6D45]" />
                      <span>Positive (Keep Target)</span>
                    </button>

                    <button
                      onClick={() => setActivePointType("negative")}
                      className={`flex-1 flex items-center justify-center space-x-2 py-2.5 rounded-xl border text-xs font-bold transition-all ${
                        activePointType === "negative"
                          ? "bg-[#FAF9F5] border-[#C83232] text-[#2C3322] shadow-sm"
                          : "border-[#E1E5D8] text-[#5C6550] bg-white hover:bg-[#F2F4EB]"
                      }`}
                    >
                      <span className="h-2 w-2 rounded-full bg-[#C83232]" />
                      <span>Negative (Exclude BG)</span>
                    </button>
                  </div>
                </div>

                {/* 3. API Pipeline Actions */}
                <div className="space-y-3 pt-2">
                  <label className="block text-xs font-bold text-[#434E35] uppercase tracking-wider">
                    Step 3: Trigger Inference Pipelines
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <button
                      onClick={triggerTracking}
                      disabled={isProcessing || !videoUrl}
                      className="bg-[#FFFFFF] hover:bg-[#F2F4EB] disabled:opacity-40 border border-[#BCC2B0] text-[#2C3322] text-xs font-bold py-3 px-4 rounded-xl transition shadow-xs flex flex-col items-center justify-center space-y-1.5 text-center"
                    >
                      <RefreshCw className="h-4 w-4 text-[#5B6D45]" />
                      <span>1. Track Objects</span>
                      <span className="text-[9px] text-[#5C6550] font-normal">POST /track-objects</span>
                    </button>

                    <button
                      onClick={triggerMatting}
                      disabled={isProcessing || !videoUrl}
                      className="bg-[#FFFFFF] hover:bg-[#F2F4EB] disabled:opacity-40 border border-[#BCC2B0] text-[#2C3322] text-xs font-bold py-3 px-4 rounded-xl transition shadow-xs flex flex-col items-center justify-center space-y-1.5 text-center"
                    >
                      <Layers className="h-4 w-4 text-[#5B6D45]" />
                      <span>2. Run Alpha Matting</span>
                      <span className="text-[9px] text-[#5C6550] font-normal">POST /run-matting</span>
                    </button>

                    <button
                      onClick={triggerRemoval}
                      disabled={isProcessing || !videoUrl}
                      className="bg-[#FFFFFF] hover:bg-[#F2F4EB] disabled:opacity-40 border border-[#BCC2B0] text-[#2C3322] text-xs font-bold py-3 px-4 rounded-xl transition shadow-xs flex flex-col items-center justify-center space-y-1.5 text-center"
                    >
                      <Trash2 className="h-4 w-4 text-[#C83232]" />
                      <span className="text-[#C83232]">3. Object Removal</span>
                      <span className="text-[9px] text-[#5C6550] font-normal">POST /run-removal</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Live Logger Output Terminal */}
              <div className="bg-[#FFFFFF] p-6 rounded-2xl border border-[#E3E8DB] shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-[#434E35] uppercase tracking-wider flex items-center">
                    <Terminal className="h-3.5 w-3.5 mr-1.5 text-[#5B6D45]" />
                    Real-time Pipeline Terminal
                  </h4>
                  <button 
                    onClick={() => setLogs(["Simulator Terminal log cleared."])}
                    className="text-[10px] text-[#5C6550] hover:underline"
                  >
                    Clear Terminal
                  </button>
                </div>
                <div className="bg-[#1E211A] rounded-xl p-4 border border-[#2E3328] font-mono text-xs min-h-[140px] max-h-[220px] overflow-y-auto space-y-1.5 shadow-inner">
                  {logs.map((log, idx) => (
                    <p key={idx} className={log.includes("Error") ? "text-[#FF8A8A]" : log.includes("POST") ? "text-[#C5D0B2] font-semibold" : "text-[#A2AB95]"}>
                      {log}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ENDPOINTS TAB VIEW (API Swagger Style Spec) */}
          {activeTab === "endpoints" && (
            <div className="space-y-4">
              <div className="bg-[#FFFFFF] p-6 rounded-2xl border border-[#E3E8DB] shadow-sm">
                <h2 className="text-lg font-bold text-[#2C3322]">Interactive Endpoint Catalog</h2>
                <p className="text-sm text-[#5C6550] mt-1">
                  Exhaustive collection of headless REST APIs mapped directly to the Python server cores.
                </p>
              </div>

              <div className="space-y-3">
                {endpoints.map((ep) => {
                  const isExpanded = expandedEndpoint === ep.path;
                  return (
                    <div 
                      key={ep.path} 
                      className={`rounded-2xl border transition-all ${
                        isExpanded ? "bg-[#FAF9F4] border-[#5B6D45] shadow-md" : "bg-[#FFFFFF] border-[#E3E8DB] hover:border-[#5B6D45] shadow-sm"
                      }`}
                    >
                      <button 
                        onClick={() => toggleEndpoint(ep.path)}
                        className="w-full text-left px-6 py-4 flex items-center justify-between"
                      >
                        <div className="flex items-center space-x-4">
                          <span className={`text-xs font-bold px-3 py-1 rounded-md tracking-wider ${
                            ep.method === "POST" ? "bg-[#5B6D45]/10 text-[#435130] border border-[#5B6D45]/20" : "bg-[#4F7396]/10 text-[#2D4D6B] border border-[#4F7396]/20"
                          }`}>
                            {ep.method}
                          </span>
                          <span className="font-mono text-sm font-bold text-[#2C3322]">{ep.path}</span>
                          <span className="text-xs text-[#5C6550] hidden md:inline-block">— {ep.desc}</span>
                        </div>
                        {isExpanded ? <ChevronUp className="h-4 w-4 text-[#5B6D45]" /> : <ChevronDown className="h-4 w-4 text-[#5C6550]" />}
                      </button>

                      {isExpanded && (
                        <div className="px-6 pb-6 border-t border-[#EAECE4] pt-4 space-y-4 font-sans">
                          {/* Request Schema */}
                          <div>
                            <h4 className="text-xs font-bold text-[#434E35] uppercase tracking-wider mb-2 flex items-center">
                              <Settings className="h-3.5 w-3.5 mr-1.5 text-[#5B6D45]" />
                              Request ({ep.requestBody.type})
                            </h4>
                            <div className="bg-[#1E211A] rounded-xl p-4 border border-[#2E3328] font-mono text-xs text-[#E2E6DA] space-y-1">
                              {Object.entries(ep.requestBody.fields).map(([name, type]) => (
                                <div key={name}>
                                  <span className="text-[#C5D0B2] font-semibold">{name}</span>: <span className="text-[#A2AB95]">{type as string}</span>
                                </div>
                              ))}
                              {Object.keys(ep.requestBody.fields).length === 0 && (
                                <span className="text-[#7A856D] italic">No parameters required</span>
                              )}
                            </div>
                          </div>

                          {/* Response Mock */}
                          <div>
                            <h4 className="text-xs font-bold text-[#434E35] uppercase tracking-wider mb-2 flex items-center">
                              <Code className="h-3.5 w-3.5 mr-1.5 text-[#5B6D45]" />
                              Response Schema
                            </h4>
                            <pre className="bg-[#1E211A] rounded-xl p-4 border border-[#2E3328] font-mono text-xs text-[#C5D0B2] overflow-x-auto">
                              {typeof ep.responseBody === "string" ? ep.responseBody : JSON.stringify(ep.responseBody, null, 2)}
                            </pre>
                          </div>

                          {/* cURL Example */}
                          <div>
                            <h4 className="text-xs font-bold text-[#434E35] uppercase tracking-wider mb-2 flex items-center">
                              <Terminal className="h-3.5 w-3.5 mr-1.5 text-[#5B6D45]" />
                              cURL Command
                            </h4>
                            <pre className="bg-[#1E211A] rounded-xl p-4 border border-[#2E3328] font-mono text-xs text-[#C83232] overflow-x-auto">
                              {ep.curl}
                            </pre>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Dynamic Mobile Device Frame Preview & Backend Architecture Info */}
        <div className="lg:col-span-5 space-y-6">
          
          {/* VIRTUAL SMARTPHONE CONTAINER */}
          <div className="bg-[#2E3326] p-4 rounded-[40px] shadow-2xl border-4 border-[#3D4534] max-w-sm mx-auto relative">
            {/* Phone Speaker/Camera Notch */}
            <div className="absolute top-6 left-1/2 transform -translate-x-1/2 w-32 h-5 bg-[#3D4534] rounded-full z-20 flex items-center justify-center">
              <span className="w-12 h-1 bg-[#1E211A] rounded-full mr-2" />
              <span className="w-2.5 h-2.5 bg-[#1E211A] rounded-full" />
            </div>

            {/* Smartphone Inner Screen */}
            <div className="bg-[#FAF9F5] rounded-[32px] overflow-hidden border border-[#1E211A] pt-8 relative min-h-[580px] flex flex-col justify-between">
              
              {/* Virtual App Bar inside phone */}
              <div className="bg-[#5B6D45] px-4 py-3 flex items-center justify-between text-white shadow-sm">
                <div className="flex items-center space-x-1.5">
                  <Smartphone className="h-4 w-4" />
                  <span className="text-xs font-bold tracking-tight">Sammie Mobile App</span>
                </div>
                <div className="flex items-center space-x-1">
                  <span className="h-2 w-2 rounded-full bg-[#E1E5D8]" />
                  <span className="text-[10px] font-mono text-[#D2D9C5]">{videoUrl ? "CONNECTED" : "OFFLINE"}</span>
                </div>
              </div>

              {/* Inner Smartphone Viewport */}
              <div className="flex-1 bg-[#F2F0E8] relative flex items-center justify-center p-2">
                {videoUrl ? (
                  <div className="w-full h-full flex flex-col justify-between relative">
                    
                    {/* Interactive Mask Video Box */}
                    <div 
                      ref={containerRef}
                      onClick={handleCanvasClick}
                      className={`relative w-full h-44 rounded-xl overflow-hidden border border-[#D5DAC9] bg-black shadow-inner cursor-crosshair group ${
                        simulatedMode === "matte" ? "bg-[radial-gradient(#e1e5d8_20%,transparent_20%)] [background-size:10px_10px]" : ""
                      }`}
                    >
                      {/* Video Stream Element */}
                      <video
                        ref={videoRef}
                        src={videoUrl}
                        loop
                        muted
                        playsInline
                        className={`w-full h-full object-cover pointer-events-none ${
                          simulatedMode === "matte" ? "opacity-75 grayscale contrast-125 saturate-200" : 
                          simulatedMode === "removed" ? "blur-xs brightness-95" : ""
                        }`}
                      />

                      {/* Simulated Alpha Matte Overlay / Checkerboard Cutout */}
                      {simulatedMode === "matte" && (
                        <div className="absolute inset-0 bg-transparent flex items-center justify-center pointer-events-none">
                          <div className="absolute top-2 left-2 bg-[#5B6D45]/90 text-white text-[9px] font-bold px-1.5 py-0.5 rounded tracking-wider">
                            ALPHA MATTE
                          </div>
                          {/* Interactive outline animation mapping */}
                          <div className="absolute inset-4 border-2 border-dashed border-[#5B6D45] animate-pulse rounded-full" />
                        </div>
                      )}

                      {/* Simulated Object Removal Overlay */}
                      {simulatedMode === "removed" && (
                        <div className="absolute inset-0 bg-black/10 flex items-center justify-center pointer-events-none">
                          <div className="absolute top-2 left-2 bg-[#C83232]/90 text-white text-[9px] font-bold px-1.5 py-0.5 rounded tracking-wider">
                            OBJECT REMOVED
                          </div>
                          <div className="text-[10px] font-semibold text-white/80 bg-black/40 px-2 py-0.5 rounded">
                            Inpainted BG
                          </div>
                        </div>
                      )}

                      {/* Clickable Mask points render */}
                      {points.map((pt, idx) => (
                        <div
                          key={idx}
                          style={{ left: `${pt.x}%`, top: `${pt.y}%` }}
                          className={`absolute w-3.5 h-3.5 -ml-1.5 -mt-1.5 rounded-full border-2 border-white shadow-md animate-ping-once z-10 flex items-center justify-center ${
                            pt.type === "positive" ? "bg-[#5B6D45]" : "bg-[#C83232]"
                          }`}
                        >
                          <span className="text-[7px] text-white font-bold">{idx + 1}</span>
                        </div>
                      ))}

                      {/* Loading status bar inside video */}
                      {isProcessing && (
                        <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center p-3 text-center">
                          <RefreshCw className="h-6 w-6 text-[#5B6D45] animate-spin mb-1.5" />
                          <span className="text-white text-[10px] font-semibold">{processStep}</span>
                          <div className="w-24 bg-white/20 h-1 rounded-full mt-2 overflow-hidden">
                            <div style={{ width: `${progress}%` }} className="bg-[#5B6D45] h-full transition-all duration-300" />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Media Actions Inside Smartphone UI */}
                    <div className="p-3 bg-white border border-[#E1E5D8] rounded-xl shadow-xs space-y-2 mt-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono text-[#5C6550]">Active Points: {points.length}</span>
                        {simulatedMode !== "normal" && (
                          <button 
                            onClick={() => setSimulatedMode("normal")} 
                            className="text-[9px] font-bold text-[#C83232] underline"
                          >
                            Reset Render
                          </button>
                        )}
                      </div>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={togglePlay}
                          className="p-2 bg-[#5B6D45] text-white rounded-lg hover:bg-[#434E35] transition"
                        >
                          {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                        </button>
                        <div className="flex-1 h-1.5 bg-[#FAF9F5] border border-[#E1E5D8] rounded-full relative">
                          <div className="absolute left-0 top-0 h-full w-1/3 bg-[#5B6D45] rounded-full" />
                        </div>
                        <span className="text-[9px] font-mono text-[#5C6550]">0:04</span>
                      </div>
                    </div>

                    {/* Quick Simulation Help banner */}
                    <div className="mt-2 text-[10px] text-center text-[#5C6550] bg-[#FAF9F5] border border-[#E1E5D8] p-2.5 rounded-lg">
                      💡 Click on video frame preview to specify segmentation coordinate points.
                    </div>
                  </div>
                ) : (
                  <div className="text-center p-6 space-y-3">
                    <Video className="h-10 w-10 text-[#BCC2B0] mx-auto" />
                    <div>
                      <p className="text-xs font-bold text-[#2C3322]">No Active Video</p>
                      <p className="text-[10px] text-[#5C6550] mt-0.5 max-w-[180px] mx-auto leading-normal">
                        Upload an MP4/MOV file from the Controller to load the interactive mockup player.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Virtual Smartphone Home bar */}
              <div className="py-2.5 flex justify-center bg-white border-t border-[#F0F2EB]">
                <div className="w-24 h-1 bg-[#BCC2B0] rounded-full" />
              </div>
            </div>
          </div>

          {/* QUICK SPECIFICATIONS PANEL */}
          <div className="bg-gradient-to-br from-[#FAF9F4] to-[#F1EFEA] p-6 rounded-2xl border border-[#E1E5D8] space-y-4 shadow-sm">
            <h3 className="text-xs font-bold text-[#5C6550] uppercase tracking-widest flex items-center">
              <Shield className="h-3.5 w-3.5 mr-1.5 text-[#5B6D45]" />
              Inference Hardware Target
            </h3>
            <div className="flex items-center justify-between border-b border-[#E1E5D8]/50 pb-2">
              <span className="text-xs text-[#5C6550] font-medium">Inference Engine</span>
              <span className="text-xs font-bold text-[#2C3322]">PyTorch v2.11 / torchvision</span>
            </div>
            <div className="flex items-center justify-between border-b border-[#E1E5D8]/50 pb-2">
              <span className="text-xs text-[#5C6550] font-medium">Target Device</span>
              <span className="text-xs font-bold font-mono text-[#C83232] bg-[#C83232]/10 border border-[#C83232]/20 px-2.5 py-0.5 rounded-md">CUDA 12.6 / MPS</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-[#5C6550] font-medium">FastAPI Port</span>
              <span className="text-xs font-mono text-[#5B6D45] font-bold">8080</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
