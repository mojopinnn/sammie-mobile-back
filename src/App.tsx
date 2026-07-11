import React, { useState } from "react";
import { 
  Play, Upload, Check, Settings, Layers, Video, Terminal, 
  Activity, Eye, Download, Code, ChevronDown, ChevronUp, RefreshCw 
} from "lucide-react";

export default function App() {
  const [activeTab, setActiveTab] = useState<"endpoints" | "schema" | "playground">("endpoints");
  const [expandedEndpoint, setExpandedEndpoint] = useState<string | null>("/upload-video");
  const [testStatus, setTestStatus] = useState<string>("Ready");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const runTestUpload = () => {
    if (!selectedFile) {
      setTestStatus("Please select a video file first");
      return;
    }
    setTestStatus("Uploading...");
    setTimeout(() => {
      setTestStatus("Success! Video loaded and SAM2 predictor initialized.");
    }, 1500);
  };

  return (
    <div className="min-h-screen bg-[#0f111a] text-gray-100 font-sans antialiased">
      {/* Top Header */}
      <header className="border-b border-gray-800 bg-[#161925] px-8 py-5 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Layers className="h-6 w-6 text-emerald-400" />
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white flex items-center">
              Sammie Roto Web <span className="ml-2 text-xs font-semibold bg-emerald-500/20 text-emerald-400 px-2.5 py-0.5 rounded-full border border-emerald-500/30">API CONSOLE</span>
            </h1>
            <p className="text-xs text-gray-400">Headless Video Segmentation, Propagation & Alpha Matting Core</p>
          </div>
        </div>
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2 text-xs text-gray-400 bg-gray-900/60 px-3.5 py-1.5 rounded-lg border border-gray-800">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>FASTAPI RUNNING AT PORT 8080</span>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto p-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: API Controls & Docs */}
        <div className="lg:col-span-8 space-y-6">
          {/* Tabs */}
          <div className="flex space-x-1 bg-gray-900/80 p-1.5 rounded-xl border border-gray-800 max-w-md">
            <button
              onClick={() => setActiveTab("endpoints")}
              className={`flex-1 flex items-center justify-center space-x-2 px-4 py-2.5 rounded-lg text-sm font-medium transition ${
                activeTab === "endpoints" 
                  ? "bg-[#1f2335] text-white shadow-md border border-gray-700/50" 
                  : "text-gray-400 hover:text-white"
              }`}
            >
              <Terminal className="h-4 w-4" />
              <span>Endpoints</span>
            </button>
            <button
              onClick={() => setActiveTab("playground")}
              className={`flex-1 flex items-center justify-center space-x-2 px-4 py-2.5 rounded-lg text-sm font-medium transition ${
                activeTab === "playground" 
                  ? "bg-[#1f2335] text-white shadow-md border border-gray-700/50" 
                  : "text-gray-400 hover:text-white"
              }`}
            >
              <Play className="h-4 w-4" />
              <span>Interactive Simulator</span>
            </button>
          </div>

          {/* Endpoints View */}
          {activeTab === "endpoints" && (
            <div className="space-y-4">
              <div className="bg-[#161925] p-5 rounded-2xl border border-gray-800">
                <h2 className="text-lg font-semibold text-white">Interactive Endpoint Catalog</h2>
                <p className="text-sm text-gray-400 mt-1">
                  Exhaustive collection of headless REST APIs mapped directly to Python's pure PyTorch inference cores.
                </p>
              </div>

              <div className="space-y-3">
                {endpoints.map((ep) => {
                  const isExpanded = expandedEndpoint === ep.path;
                  return (
                    <div 
                      key={ep.path} 
                      className={`rounded-2xl border transition ${
                        isExpanded ? "bg-[#161925] border-gray-700" : "bg-[#11131e] border-gray-800 hover:border-gray-700"
                      }`}
                    >
                      <button 
                        onClick={() => toggleEndpoint(ep.path)}
                        className="w-full text-left px-6 py-4 flex items-center justify-between"
                      >
                        <div className="flex items-center space-x-4">
                          <span className={`text-xs font-bold px-3 py-1 rounded-md tracking-wider ${
                            ep.method === "POST" ? "bg-emerald-500/15 text-emerald-400" : "bg-blue-500/15 text-blue-400"
                          }`}>
                            {ep.method}
                          </span>
                          <span className="font-mono text-sm font-medium text-gray-100">{ep.path}</span>
                          <span className="text-xs text-gray-400 hidden md:inline-block">— {ep.desc}</span>
                        </div>
                        {isExpanded ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                      </button>

                      {isExpanded && (
                        <div className="px-6 pb-6 border-t border-gray-800/80 pt-4 space-y-4 font-sans">
                          {/* Request Schema */}
                          <div>
                            <h4 className="text-xs font-semibold text-gray-300 uppercase tracking-wider mb-2 flex items-center">
                              <Settings className="h-3.5 w-3.5 mr-1.5 text-gray-400" />
                              Request ({ep.requestBody.type})
                            </h4>
                            <div className="bg-gray-900/60 rounded-xl p-4 border border-gray-800/80 font-mono text-xs text-gray-300 space-y-1">
                              {Object.entries(ep.requestBody.fields).map(([name, type]) => (
                                <div key={name}>
                                  <span className="text-emerald-400 font-medium">{name}</span>: <span className="text-gray-400">{type as string}</span>
                                </div>
                              ))}
                              {Object.keys(ep.requestBody.fields).length === 0 && (
                                <span className="text-gray-500 italic">No parameters required</span>
                              )}
                            </div>
                          </div>

                          {/* Response Mock */}
                          <div>
                            <h4 className="text-xs font-semibold text-gray-300 uppercase tracking-wider mb-2 flex items-center">
                              <Code className="h-3.5 w-3.5 mr-1.5 text-gray-400" />
                              Response Schema
                            </h4>
                            <pre className="bg-gray-900/60 rounded-xl p-4 border border-gray-800/80 font-mono text-xs text-emerald-300 overflow-x-auto">
                              {typeof ep.responseBody === "string" ? ep.responseBody : JSON.stringify(ep.responseBody, null, 2)}
                            </pre>
                          </div>

                          {/* cURL Example */}
                          <div>
                            <h4 className="text-xs font-semibold text-gray-300 uppercase tracking-wider mb-2 flex items-center">
                              <Terminal className="h-3.5 w-3.5 mr-1.5 text-gray-400" />
                              cURL Command
                            </h4>
                            <pre className="bg-gray-900/60 rounded-xl p-4 border border-gray-800/80 font-mono text-xs text-sky-300 overflow-x-auto">
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

          {/* Playground / Simulator View */}
          {activeTab === "playground" && (
            <div className="bg-[#161925] p-6 rounded-2xl border border-gray-800 space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-white">Interactive Endpoint Simulator</h3>
                <p className="text-sm text-gray-400 mt-1">
                  Test and mock client-server pipeline requests interactively.
                </p>
              </div>

              {/* Upload simulation widget */}
              <div className="border border-dashed border-gray-700/80 rounded-xl p-8 bg-gray-900/20 text-center space-y-4">
                <div className="mx-auto w-12 h-12 rounded-full bg-gray-800/80 flex items-center justify-center">
                  <Video className="h-6 w-6 text-gray-300" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-gray-200">
                    {selectedFile ? selectedFile.name : "Select a test video for uploading"}
                  </p>
                  <p className="text-xs text-gray-400">MP4, MOV, or WEBM up to 200MB</p>
                </div>
                <div className="flex items-center justify-center space-x-3">
                  <label className="cursor-pointer bg-gray-800 hover:bg-gray-700 text-xs text-white font-medium px-4 py-2 rounded-lg border border-gray-700/60 transition">
                    Browse File
                    <input type="file" accept="video/*" onChange={handleFileChange} className="hidden" />
                  </label>
                  <button 
                    onClick={runTestUpload}
                    className="bg-emerald-500 hover:bg-emerald-600 text-xs text-white font-medium px-4 py-2 rounded-lg transition"
                  >
                    Simulate /upload-video
                  </button>
                </div>
              </div>

              {/* API Feedback Terminal */}
              <div className="space-y-2">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center">
                  <Activity className="h-3.5 w-3.5 mr-1.5 text-emerald-400" />
                  Simulation Output Log
                </span>
                <div className="bg-gray-950 rounded-xl p-5 border border-gray-800/80 font-mono text-xs min-h-[140px] flex flex-col justify-between">
                  <div className="space-y-1 text-gray-300">
                    <p className="text-gray-500">{"[10:14:02] INITIALIZING SIMULATION CONSOLE"}</p>
                    <p className="text-emerald-400">{`[10:14:02] STATUS: ${testStatus}`}</p>
                    {selectedFile && (
                      <p className="text-sky-300">{`[10:14:15] FILE SELECTED: ${selectedFile.name} (${(selectedFile.size / (1024*1024)).toFixed(2)} MB)`}</p>
                    )}
                  </div>
                  <div className="text-gray-500 text-[10px] text-right border-t border-gray-900 pt-3">
                    FASTAPI API LOG STREAM
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Engine Architecture Overview */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-[#161925] p-6 rounded-2xl border border-gray-800 space-y-5">
            <h3 className="text-md font-bold text-white tracking-tight">Backend Architecture</h3>
            
            <div className="space-y-4">
              {/* Architecture Core */}
              <div className="flex items-start space-x-3.5">
                <div className="bg-emerald-500/10 p-2 rounded-xl border border-emerald-500/10 mt-0.5">
                  <Settings className="h-4 w-4 text-emerald-400" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-gray-200">SammieWebKitCore</h4>
                  <p className="text-xs text-gray-400 mt-1">
                    Python Singleton Pattern engine built inside <code className="font-mono bg-gray-900 px-1 py-0.5 text-emerald-300 rounded">app_core.py</code>, ensuring high efficiency.
                  </p>
                </div>
              </div>

              {/* SAM2 Predictor */}
              <div className="flex items-start space-x-3.5">
                <div className="bg-sky-500/10 p-2 rounded-xl border border-sky-500/10 mt-0.5">
                  <Activity className="h-4 w-4 text-sky-400" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-gray-200">SAM2 (Segment Anything 2.1)</h4>
                  <p className="text-xs text-gray-400 mt-1">
                    Extracts frames, initialises the predictor state, and handles interactive masking coordinates.
                  </p>
                </div>
              </div>

              {/* MatAnyone propagation */}
              <div className="flex items-start space-x-3.5">
                <div className="bg-purple-500/10 p-2 rounded-xl border border-purple-500/10 mt-0.5">
                  <Layers className="h-4 w-4 text-purple-400" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-gray-200">MatAnyone / MatAnyone2</h4>
                  <p className="text-xs text-gray-400 mt-1">
                    Fibers up temporal alpha matting across all sequential frames with fine edge-transition transparency.
                  </p>
                </div>
              </div>

              {/* MiniMax Remover */}
              <div className="flex items-start space-x-3.5">
                <div className="bg-amber-500/10 p-2 rounded-xl border border-amber-500/10 mt-0.5">
                  <RefreshCw className="h-4 w-4 text-amber-400 animate-spin-slow" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-gray-200">MiniMax-Remover</h4>
                  <p className="text-xs text-gray-400 mt-1">
                    Diffusion-based background object removal with VAE slicing and tiling parameters.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Stats Panel */}
          <div className="bg-gradient-to-br from-[#121420] to-[#1a1326] p-6 rounded-2xl border border-gray-800 space-y-4">
            <h3 className="text-xs font-bold text-gray-300 uppercase tracking-widest">Inference Device</h3>
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-400">Target Device</span>
              <span className="text-xs font-semibold font-mono text-emerald-400 bg-emerald-400/15 border border-emerald-400/20 px-2 py-0.5 rounded-md">CUDA 12.6 / MPS</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-400">Host Framework</span>
              <span className="text-xs font-semibold text-gray-200">PyTorch v2.11 / torchvision</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-400">FastAPI Port</span>
              <span className="text-xs font-mono text-sky-400 font-semibold">8080</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
