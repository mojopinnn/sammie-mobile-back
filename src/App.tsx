import React, { useState } from "react";
import { 
  Play, Upload, Check, Settings, Layers, Video, Terminal, 
  Activity, Eye, Download, Code, ChevronDown, ChevronUp, RefreshCw 
} from "lucide-react";

export default function App() {
  const [activeTab, setActiveTab] = useState<"endpoints" | "playground">("playground"); // Default to playground to show workspace
  const [expandedEndpoint, setExpandedEndpoint] = useState<string | null>("/upload-video");
  const [testStatus, setTestStatus] = useState<string>("Ready");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Live integration config & states
  const [backendUrl, setBackendUrl] = useState<string>(
    (import.meta as any).env?.VITE_BACKEND_URL || "https://sammie-backend-1077475897510.us-central1.run.app"
  );
  const [connectionStatus, setConnectionStatus] = useState<"unknown" | "testing" | "online" | "offline">("unknown");
  const [selectedEndpointPath, setSelectedEndpointPath] = useState<string>("/upload-video");
  const [apiLoading, setApiResponseLoading] = useState<boolean>(false);
  const [apiResponse, setApiResponse] = useState<any>(null);
  const [responseStatus, setResponseStatus] = useState<number | null>(null);
  
  // Endpoint parameters state
  const [frameNumber, setFrameNumber] = useState<number>(0);
  const [objectId, setObjectId] = useState<number>(0);
  const [coordX, setCoordX] = useState<number>(450);
  const [coordY, setCoordY] = useState<number>(320);
  const [labelType, setLabelType] = useState<number>(1); // 1: positive, 0: negative
  const [startFrame, setStartFrame] = useState<string>("0");
  const [endFrame, setEndFrame] = useState<string>("120");
  const [combinedMatting, setCombinedMatting] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<string>("Segmentation-Edit");
  const [previewUrl, setPreviewUrl] = useState<string>("");

  // Visual Workspace Interactive States
  const [clicksList, setClicksList] = useState<{ x: number; y: number; label: number; pctX: number; pctY: number }[]>([]);
  const [instantSegmentMode, setInstantSegmentMode] = useState<boolean>(true);
  const [cacheBuster, setCacheBuster] = useState<number>(1);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [totalFrames, setTotalFrames] = useState<number>(120);
  const [isVideoUploaded, setIsVideoUploaded] = useState<boolean>(false);
  const [imageError, setImageError] = useState<boolean>(false);
  const [selectedModel, setSelectedModel] = useState<string>("Efficient");

  const [logs, setLogs] = useState<string[]>([
    `[${new Date().toLocaleTimeString()}] Initializing Sammie Roto Interactive Suite...`,
    `[${new Date().toLocaleTimeString()}] Click directly on the video preview below to set points!`
  ]);

  const addLog = (msg: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, `[${timestamp}] ${msg}`]);
  };

  const testConnection = async () => {
    setConnectionStatus("testing");
    addLog(`Checking connection to backend at: ${backendUrl}...`);
    try {
      const response = await fetch(backendUrl);
      if (response.ok) {
        const data = await response.json();
        setConnectionStatus("online");
        addLog(`[Success] Connected! Backend status is: ${data.status || 'online'}`);
        if (data.endpoints) {
          addLog(`Backend endpoints registered: ${JSON.stringify(data.endpoints)}`);
        }
      } else {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (err: any) {
      setConnectionStatus("offline");
      addLog(`[Error] Failed to connect to backend: ${err.message || err}`);
    }
  };

  React.useEffect(() => {
    testConnection();
  }, []);

  // Playback simulation for watch-propagation
  React.useEffect(() => {
    let interval: any = null;
    if (isPlaying) {
      interval = setInterval(() => {
        setFrameNumber(prev => {
          if (prev >= totalFrames - 1) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, 400);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isPlaying, totalFrames]);

  // Handle click directly on image
  const handleImageClick = (e: React.MouseEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    const rect = img.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    
    // Calculate percentage coords for plotting interactive dot
    const pctX = (clickX / rect.width) * 100;
    const pctY = (clickY / rect.height) * 100;

    // Map to natural image dimensions
    const naturalW = img.naturalWidth || 1920;
    const naturalH = img.naturalHeight || 1080;
    const x = Math.round((clickX / rect.width) * naturalW);
    const y = Math.round((clickY / rect.height) * naturalH);

    setCoordX(x);
    setCoordY(y);

    const newClick = { x, y, label: labelType, pctX, pctY };
    setClicksList(prev => [...prev, newClick]);
    
    addLog(`Image Clicked at [${x}, ${y}] (natural resolution: ${naturalW}x${naturalH}). Label: ${labelType === 1 ? "Positive (Keep)" : "Negative (Remove)"}`);

    if (instantSegmentMode) {
      submitSegmentPoint(x, y);
    }
  };

  const handleFrameChange = (val: number) => {
    setFrameNumber(val);
    setClicksList([]); // Clear clicked visual overlays on other frames
    setImageError(false);
  };

  // REST API Methods
  const uploadVideoFile = async () => {
    if (!selectedFile) {
      addLog("[Error] Please select a video file first.");
      setTestStatus("Select a video first");
      return;
    }
    setApiResponseLoading(true);
    setApiResponse(null);
    setResponseStatus(null);
    setTestStatus("Uploading...");
    addLog(`Uploading video file '${selectedFile.name}' (${(selectedFile.size / (1024 * 1024)).toFixed(2)} MB)...`);

    const url = `${backendUrl.replace(/\/$/, "")}/upload-video?model_name=${selectedModel}`;
    const formData = new FormData();
    formData.append("file", selectedFile);

    try {
      const startTime = performance.now();
      const response = await fetch(url, {
        method: "POST",
        body: formData,
      });
      const endTime = performance.now();
      const duration = (endTime - startTime).toFixed(0);

      setResponseStatus(response.status);
      addLog(`[Response] Upload returned HTTP ${response.status} in ${duration}ms`);

      if (response.ok) {
        const data = await response.json();
        setApiResponse(data);
        if (data.total_frames) {
          setTotalFrames(data.total_frames);
          setIsVideoUploaded(true);
          setImageError(false);
          addLog(`[Success] Video uploaded successfully! Frames: ${data.total_frames}, Dimensions: ${data.width}x${data.height}`);
        } else {
          setIsVideoUploaded(true);
          setImageError(false);
          addLog(`[Success] Video uploaded: ${JSON.stringify(data)}`);
        }
        setTestStatus("Uploaded!");
        setClicksList([]);
        setFrameNumber(0);
        setViewMode("Segmentation-Edit");
        setCacheBuster(prev => prev + 1);
      } else {
        const text = await response.text();
        addLog(`[Error] Upload failed (${response.status}): ${text}`);
        setTestStatus(`Failed (${response.status})`);
        setApiResponse(text);
      }
    } catch (err: any) {
      addLog(`[Network Error] Upload request failed: ${err.message || err}`);
      setTestStatus("Network Error");
      setApiResponse({ error: err.message || "Network request failed." });
    } finally {
      setApiResponseLoading(false);
    }
  };

  const submitSegmentPoint = async (overrideX?: number, overrideY?: number) => {
    setApiResponseLoading(true);
    setApiResponse(null);
    setResponseStatus(null);
    setTestStatus("Segmenting...");

    const targetX = overrideX !== undefined ? overrideX : coordX;
    const targetY = overrideY !== undefined ? overrideY : coordY;

    addLog(`Submitting Segment Point: Frame=${frameNumber}, Object ID=${objectId}, Coord=[${targetX}, ${targetY}], Label=${labelType}`);

    const url = `${backendUrl.replace(/\/$/, "")}/segment-point`;
    const payload = {
      frame_number: frameNumber,
      object_id: objectId,
      coords: [[targetX, targetY]],
      labels: [labelType],
    };

    try {
      const startTime = performance.now();
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const endTime = performance.now();
      const duration = (endTime - startTime).toFixed(0);

      setResponseStatus(response.status);
      addLog(`[Response] Segment returned HTTP ${response.status} in ${duration}ms`);

      if (response.ok) {
        const data = await response.json();
        setApiResponse(data);
        addLog(`[Success] Segment point registered! SAM2 mask generated.`);
        setTestStatus("Succeeded!");
        setCacheBuster(prev => prev + 1); // Refresh the image!
      } else {
        const text = await response.text();
        addLog(`[Error] Segment point failed: ${text}`);
        setTestStatus("Failed");
        setApiResponse(text);
      }
    } catch (err: any) {
      addLog(`[Network Error] Segment point request failed: ${err.message || err}`);
      setTestStatus("Network Error");
    } finally {
      setApiResponseLoading(false);
    }
  };

  const runPropagation = async () => {
    setApiResponseLoading(true);
    setApiResponse(null);
    setResponseStatus(null);
    setTestStatus("Propagating...");
    addLog(`Running Track Propagation across video. Frames: ${startFrame} to ${endFrame}...`);

    const url = `${backendUrl.replace(/\/$/, "")}/track-objects`;
    const payload: any = {};
    if (startFrame !== "") payload.start_frame = parseInt(startFrame, 10);
    if (endFrame !== "") payload.end_frame = parseInt(endFrame, 10);

    try {
      const startTime = performance.now();
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const endTime = performance.now();
      const duration = (endTime - startTime).toFixed(0);

      setResponseStatus(response.status);
      addLog(`[Response] Propagation returned HTTP ${response.status} in ${duration}ms`);

      if (response.ok) {
        const data = await response.json();
        setApiResponse(data);
        addLog(`[Success] Temporal propagation complete across all frames!`);
        setTestStatus("Propagation complete!");
        setCacheBuster(prev => prev + 1);
      } else {
        const text = await response.text();
        addLog(`[Error] Propagation failed: ${text}`);
        setTestStatus("Failed");
        setApiResponse(text);
      }
    } catch (err: any) {
      addLog(`[Network Error] Propagation request failed: ${err.message || err}`);
      setTestStatus("Network Error");
    } finally {
      setApiResponseLoading(false);
    }
  };

  const runAlphaMattingPass = async () => {
    setApiResponseLoading(true);
    setApiResponse(null);
    setResponseStatus(null);
    setTestStatus("Matting...");
    addLog(`Executing MatAnyone alpha matting pass (combined matting: ${combinedMatting})...`);

    const url = `${backendUrl.replace(/\/$/, "")}/run-matting`;
    const payload = {
      combined: combinedMatting,
    };

    try {
      const startTime = performance.now();
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const endTime = performance.now();
      const duration = (endTime - startTime).toFixed(0);

      setResponseStatus(response.status);
      addLog(`[Response] Matting returned HTTP ${response.status} in ${duration}ms`);

      if (response.ok) {
        const data = await response.json();
        setApiResponse(data);
        addLog(`[Success] Matting complete! Switch view mode to 'Matting-Matte' to inspect transparency map.`);
        setTestStatus("Matting complete!");
        setViewMode("Matting-Matte");
        setCacheBuster(prev => prev + 1);
      } else {
        const text = await response.text();
        addLog(`[Error] Matting failed: ${text}`);
        setTestStatus("Failed");
        setApiResponse(text);
      }
    } catch (err: any) {
      addLog(`[Network Error] Matting request failed: ${err.message || err}`);
      setTestStatus("Network Error");
    } finally {
      setApiResponseLoading(false);
    }
  };

  const runBackgroundRemoval = async () => {
    setApiResponseLoading(true);
    setApiResponse(null);
    setResponseStatus(null);
    setTestStatus("Removing...");
    addLog("Executing diffusion-based inpainting removal on segmented regions...");

    const url = `${backendUrl.replace(/\/$/, "")}/run-removal`;

    try {
      const startTime = performance.now();
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const endTime = performance.now();
      const duration = (endTime - startTime).toFixed(0);

      setResponseStatus(response.status);
      addLog(`[Response] Removal returned HTTP ${response.status} in ${duration}ms`);

      if (response.ok) {
        const data = await response.json();
        setApiResponse(data);
        addLog(`[Success] Object removal complete! Switch view mode to 'ObjectRemoval' to see the inpainted background.`);
        setTestStatus("Removal complete!");
        setViewMode("ObjectRemoval");
        setCacheBuster(prev => prev + 1);
      } else {
        const text = await response.text();
        addLog(`[Error] Removal failed: ${text}`);
        setTestStatus("Failed");
        setApiResponse(text);
      }
    } catch (err: any) {
      addLog(`[Network Error] Removal request failed: ${err.message || err}`);
      setTestStatus("Network Error");
    } finally {
      setApiResponseLoading(false);
    }
  };

  const [compileLoading, setCompileLoading] = useState<boolean>(false);

  const compileVideo = async () => {
    setCompileLoading(true);
    addLog(`🎬 Manually compiling output video for view mode: '${viewMode}'...`);
    const url = `${backendUrl.replace(/\/$/, "")}/compile-video`;
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ view_mode: viewMode }),
      });
      if (response.ok) {
        const data = await response.json();
        setApiResponse(data);
        addLog(`[Success] Video compilation complete! GCS Link: ${data.gcs_url}`);
      } else {
        const errText = await response.text();
        addLog(`[Error] Video compilation failed: ${errText}`);
        alert(`동영상 컴파일 실패: ${errText}`);
      }
    } catch (err: any) {
      addLog(`[Network Error] Video compile failed: ${err.message || err}`);
      alert(`네트워크 오류로 컴파일 실패: ${err.message || err}`);
    } finally {
      setCompileLoading(false);
    }
  };

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
      curl: `curl -X POST "${backendUrl}/upload-video" \\
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
      curl: `curl -X POST "${backendUrl}/segment-point" \\
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
      curl: `curl -X POST "${backendUrl}/track-objects" \\
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
      curl: `curl -X POST "${backendUrl}/run-matting" \\
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
      curl: `curl -X POST "${backendUrl}/run-removal" \\
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
      curl: `curl -o preview_frame_10.jpg "${backendUrl}/preview?frame_number=10&view_mode=Segmentation-Edit"`
    }
  ];

  const toggleEndpoint = (path: string) => {
    setExpandedEndpoint(expandedEndpoint === path ? null : path);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
      setIsVideoUploaded(false);
      setImageError(false);
    }
  };

  const sendLiveRequest = async () => {
    setApiResponseLoading(true);
    setApiResponse(null);
    setResponseStatus(null);
    setPreviewUrl("");
    setTestStatus("Running...");
    addLog(`Initiating live request: ${selectedEndpointPath}`);

    const url = `${backendUrl.replace(/\/$/, "")}${selectedEndpointPath}`;

    try {
      let options: RequestInit = {};

      if (selectedEndpointPath === "/upload-video") {
        if (!selectedFile) {
          addLog("[Error] No video file selected.");
          setTestStatus("Please select a video file first");
          setApiResponseLoading(false);
          return;
        }
        const formData = new FormData();
        formData.append("file", selectedFile);
        options = {
          method: "POST",
          body: formData,
        };
        addLog(`Uploading file '${selectedFile.name}' (${(selectedFile.size / (1024 * 1024)).toFixed(2)} MB)...`);
      } else if (selectedEndpointPath === "/segment-point") {
        const payload = {
          frame_number: frameNumber,
          object_id: objectId,
          coords: [[coordX, coordY]],
          labels: [labelType],
        };
        options = {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        };
        addLog(`Sending Point Segmentation payload: ${JSON.stringify(payload)}`);
      } else if (selectedEndpointPath === "/track-objects") {
        const payload: any = {};
        if (startFrame !== "") payload.start_frame = parseInt(startFrame, 10);
        if (endFrame !== "") payload.end_frame = parseInt(endFrame, 10);
        
        options = {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        };
        addLog(`Sending Track Propagation payload: ${JSON.stringify(payload)}`);
      } else if (selectedEndpointPath === "/run-matting") {
        const payload = {
          combined: combinedMatting,
        };
        options = {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        };
        addLog(`Running Alpha Matting payload: ${JSON.stringify(payload)}`);
      } else if (selectedEndpointPath === "/run-removal") {
        options = {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        };
        addLog(`Running Background Object Removal...`);
      } else if (selectedEndpointPath === "/preview") {
        const queryUrl = `${url}?frame_number=${frameNumber}&view_mode=${viewMode}`;
        addLog(`Loading Real-time JPEG Preview: frame=${frameNumber}, mode=${viewMode}`);
        addLog(`GET URL: ${queryUrl}`);
        setPreviewUrl(queryUrl);
        setResponseStatus(200);
        setApiResponse({ info: "Rendering JPEG image stream directly from backend" });
        setApiResponseLoading(false);
        setTestStatus("Preview loaded!");
        return;
      }

      const startTime = performance.now();
      const response = await fetch(url, options);
      const endTime = performance.now();
      const duration = (endTime - startTime).toFixed(0);

      setResponseStatus(response.status);
      addLog(`[Response] Received HTTP ${response.status} in ${duration}ms`);

      if (response.ok) {
        const data = await response.json();
        setApiResponse(data);
        addLog(`[Success] Request completed successfully: ${JSON.stringify(data)}`);
        setTestStatus("Request succeeded!");
      } else {
        const text = await response.text();
        let parsedError = text;
        try {
          parsedError = JSON.parse(text);
        } catch (_) {}
        setApiResponse(parsedError);
        addLog(`[Error] Request failed with status ${response.status}: ${text}`);
        setTestStatus(`Failed (HTTP ${response.status})`);
      }
    } catch (err: any) {
      addLog(`[Network Error] Fetch failed: ${err.message || err}`);
      setApiResponse({ error: err.message || "Network request failed. Is CORS enabled and server running?" });
      setTestStatus("Network Error");
    } finally {
      setApiResponseLoading(false);
    }
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
            <span className={`h-2 w-2 rounded-full ${
              connectionStatus === 'online' ? 'bg-emerald-500 animate-pulse' :
              connectionStatus === 'testing' ? 'bg-amber-500 animate-pulse' :
              connectionStatus === 'offline' ? 'bg-rose-500' : 'bg-gray-500'
            }`}></span>
            <span className="uppercase font-mono tracking-wider">Backend: {connectionStatus}</span>
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
              <span>Endpoints Directory</span>
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
              <span>Live API Playground</span>
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
            <div className="space-y-6">
              {/* Main Workspace Row */}
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
                
                {/* Left Section: Interactive Video Monitor & Timeline (Col-span 8) */}
                <div className="xl:col-span-8 space-y-4">
                  {/* Interactive Monitor Screen */}
                  <div className="bg-[#161925] rounded-2xl border border-gray-800 p-4 space-y-3 shadow-xl">
                    <div className="flex items-center justify-between border-b border-gray-800 pb-3">
                      <div className="flex items-center space-x-2">
                        <Video className="h-4 w-4 text-emerald-400" />
                        <span className="text-xs font-bold text-gray-200 tracking-wider uppercase">Interactive Video Preview Monitor</span>
                      </div>
                      <div className="flex items-center space-x-3 text-[11px]">
                        <span className="text-gray-400">
                          Frame: <strong className="text-white font-mono">{frameNumber}</strong> / <span className="font-mono">{totalFrames - 1}</span>
                        </span>
                        <span className="h-3 w-[1px] bg-gray-800"></span>
                        <span className="text-gray-400 flex items-center space-x-1">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                          <span>View: <strong className="text-white font-mono">{viewMode}</strong></span>
                        </span>
                      </div>
                    </div>

                    {/* Image Viewport Frame */}
                    <div className="relative select-none max-w-full overflow-hidden bg-[#0a0b10] aspect-video rounded-xl border border-gray-800 flex items-center justify-center group shadow-inner">
                      {/* Grid background to represent alpha/matting */}
                      <div className="absolute inset-0 opacity-[0.03] pointer-events-none bg-[linear-gradient(45deg,#ccc_25%,transparent_25%),linear-gradient(-45deg,#ccc_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#ccc_75%),linear-gradient(-45deg,transparent_75%,#ccc_75%)] bg-[size:20px_20px] bg-[position:0_0,0_10px,10px_-10px,-10px_0]"></div>
                      
                      {/* Live Image Stream */}
                      {isVideoUploaded && !imageError ? (
                        <img 
                          src={`${backendUrl.replace(/\/$/, "")}/preview?frame_number=${frameNumber}&view_mode=${viewMode}&t=${cacheBuster}`}
                          alt="SAM2 Active Frame Preview"
                          onClick={handleImageClick}
                          className="max-h-full max-w-full object-contain cursor-crosshair relative z-10 select-none transition-all duration-150"
                          referrerPolicy="no-referrer"
                          onError={(e) => {
                            addLog("[Error] Failed to load preview frame. Setting imageError state.");
                            setImageError(true);
                          }}
                        />
                      ) : (
                        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center p-6 text-center bg-[#0d0f17]/95 text-gray-300 select-none">
                          <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center mb-3 border border-amber-500/20 animate-pulse">
                            <Video className="h-6 w-6 text-amber-400" />
                          </div>
                          <h4 className="text-sm font-bold text-white mb-1.5">
                            {!isVideoUploaded ? "비디오 업로드 필요 (Video Required)" : "⚠️ 화면을 불러올 수 없습니다 (Inference Error)"}
                          </h4>
                          <p className="text-xs text-gray-400 max-w-md leading-relaxed">
                            {!isVideoUploaded 
                              ? "오른쪽 [1단계: Import raw video source]에서 비디오 파일을 선택한 다음, 녹색 'Upload & Initialize Tracker' 버튼을 꼭 클릭하여 서버를 초기화해 주세요!"
                              : "서버 연결이 재설정되었거나 비디오 데이터를 찾을 수 없습니다. 오른쪽 [1단계]에서 비디오를 다시 업로드해 주세요."}
                          </p>
                          <div className="mt-4 flex space-x-3 pointer-events-auto">
                            {!isVideoUploaded && selectedFile && (
                              <button
                                onClick={uploadVideoFile}
                                className="px-4 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-black font-bold text-xs rounded-lg transition shadow-lg shadow-emerald-500/20"
                              >
                                지금 업로드하기 (Upload Now)
                              </button>
                            )}
                            <button
                              onClick={() => {
                                setIsVideoUploaded(true);
                                setImageError(false);
                                setCacheBuster(prev => prev + 1);
                              }}
                              className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs rounded-lg border border-gray-700 transition"
                            >
                              재시도 (Retry)
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Interactive Visual Overlay Dot Pins */}
                      <div className="absolute inset-0 z-20 pointer-events-none">
                        {clicksList.map((click, i) => (
                          <div
                            key={i}
                            style={{
                              left: `${click.pctX}%`,
                              top: `${click.pctY}%`,
                              transform: "translate(-50%, -50%)"
                            }}
                            className={`absolute w-4 h-4 rounded-full border-2 border-white shadow-lg flex items-center justify-center animate-pulse ${
                              click.label === 1 
                                ? "bg-emerald-500 shadow-emerald-500/50" 
                                : "bg-rose-500 shadow-rose-500/50"
                            }`}
                          >
                            <span className="text-[8px] font-bold text-white leading-none">
                              {click.label === 1 ? "+" : "-"}
                            </span>
                          </div>
                        ))}
                      </div>

                      {/* Hover Overlay Hint */}
                      <div className="absolute bottom-4 left-4 right-4 bg-gray-900/95 backdrop-blur border border-gray-800 rounded-lg p-2.5 z-30 opacity-90 transition-opacity flex items-center justify-between text-xs">
                        <div className="flex items-center space-x-2">
                          <span className="flex h-2 w-2 relative">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                          </span>
                          <span className="text-gray-300 font-medium">
                            {clicksList.length === 0 
                              ? "화면을 직접 마우스로 클릭하여 포인트를 지정하세요!" 
                              : `등록된 포인트: ${clicksList.length}개 (X: ${coordX}, Y: ${coordY})`}
                          </span>
                        </div>
                        <span className="text-[10px] text-gray-500 bg-gray-950 px-2 py-0.5 rounded border border-gray-800 font-mono">
                          {labelType === 1 ? "Positive (Keep)" : "Negative (Remove)"} Mode
                        </span>
                      </div>
                    </div>

                    {/* Timeline slider control */}
                    <div className="space-y-2 pt-1">
                      <div className="flex items-center justify-between text-xs text-gray-400 font-mono px-1">
                        <span>START (0)</span>
                        <span className="text-emerald-400 font-bold bg-emerald-500/15 px-2 py-0.5 rounded border border-emerald-500/20">
                          FRAME {frameNumber}
                        </span>
                        <span>END ({totalFrames - 1})</span>
                      </div>
                      <div className="flex items-center space-x-4">
                        <input
                          type="range"
                          min={0}
                          max={totalFrames - 1}
                          value={frameNumber}
                          onChange={(e) => handleFrameChange(parseInt(e.target.value, 10))}
                          className="flex-1 accent-emerald-400 bg-gray-800 rounded-lg appearance-none h-2 cursor-pointer"
                        />
                      </div>
                    </div>

                    {/* Scrub & Playback Controls bar */}
                    <div className="flex flex-wrap items-center justify-between gap-4 bg-gray-950/40 p-2.5 rounded-xl border border-gray-800/60">
                      {/* Step Controls */}
                      <div className="flex items-center space-x-1">
                        <button
                          onClick={() => handleFrameChange(0)}
                          className="p-1.5 hover:bg-gray-800 rounded text-gray-400 hover:text-white transition text-xs font-mono font-medium"
                          title="Jump to Start"
                        >
                          [0]
                        </button>
                        <button
                          onClick={() => handleFrameChange(Math.max(0, frameNumber - 10))}
                          className="p-1.5 hover:bg-gray-800 rounded text-gray-400 hover:text-white transition text-xs font-semibold"
                          title="Back 10 frames"
                        >
                          -10
                        </button>
                        <button
                          onClick={() => handleFrameChange(Math.max(0, frameNumber - 1))}
                          className="p-1.5 hover:bg-gray-800 rounded text-gray-400 hover:text-white transition text-xs font-semibold"
                          title="Back 1 frame"
                        >
                          -1
                        </button>
                        <button
                          onClick={() => setIsPlaying(!isPlaying)}
                          className={`px-3 py-1 rounded text-xs font-semibold flex items-center space-x-1.5 transition ${
                            isPlaying ? "bg-amber-500/25 text-amber-400 border border-amber-500/30" : "bg-emerald-500/25 text-emerald-400 border border-emerald-500/30"
                          }`}
                        >
                          <span>{isPlaying ? "Pause" : "Play Run"}</span>
                        </button>
                        <button
                          onClick={() => handleFrameChange(Math.min(totalFrames - 1, frameNumber + 1))}
                          className="p-1.5 hover:bg-gray-800 rounded text-gray-400 hover:text-white transition text-xs font-semibold"
                          title="Forward 1 frame"
                        >
                          +1
                        </button>
                        <button
                          onClick={() => handleFrameChange(Math.min(totalFrames - 1, frameNumber + 10))}
                          className="p-1.5 hover:bg-gray-800 rounded text-gray-400 hover:text-white transition text-xs font-semibold"
                          title="Forward 10 frames"
                        >
                          +10
                        </button>
                        <button
                          onClick={() => handleFrameChange(totalFrames - 1)}
                          className="p-1.5 hover:bg-gray-800 rounded text-gray-400 hover:text-white transition text-xs font-mono font-medium"
                          title="Jump to End"
                        >
                          [{totalFrames - 1}]
                        </button>
                      </div>

                      {/* Refresh button */}
                      <button
                        onClick={() => setCacheBuster(prev => prev + 1)}
                        className="flex items-center space-x-1 px-2.5 py-1.5 bg-gray-900 hover:bg-gray-800 text-[11px] font-medium text-gray-300 rounded-lg border border-gray-800 transition"
                      >
                        <RefreshCw className="h-3 w-3" />
                        <span>Force Refresh Frame</span>
                      </button>
                    </div>
                  </div>

                  {/* Rendering Mode Selector Tabs */}
                  <div className="bg-[#161925] rounded-2xl border border-gray-800 p-4 space-y-3">
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block">Visual Mask Overlay Settings</span>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                      {[
                        { mode: "Segmentation-Edit", label: "SAM2 Overlay", desc: "Interactive masking" },
                        { mode: "Segmentation-BGcolor", label: "Chroma BG", desc: "Green-screen cut" },
                        { mode: "Matting-Matte", label: "Alpha Matte", desc: "Edge transparency" },
                        { mode: "ObjectRemoval", label: "Inpaint Remove", desc: "Background patch" },
                        { mode: "None", label: "Raw Video", desc: "Original file" }
                      ].map((item) => (
                        <button
                          key={item.mode}
                          onClick={() => setViewMode(item.mode)}
                          className={`px-3 py-2.5 rounded-xl border text-left transition ${
                            viewMode === item.mode 
                              ? "bg-emerald-500/10 border-emerald-500/50 text-emerald-400" 
                              : "bg-gray-900/40 border-gray-800 text-gray-400 hover:text-gray-200 hover:border-gray-700"
                          }`}
                        >
                          <div className="text-xs font-bold font-mono">{item.label}</div>
                          <div className="text-[9px] text-gray-500 mt-0.5">{item.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* GCS Video Results Player & Download */}
                  <div className="bg-[#161925] rounded-2xl border border-gray-800 p-5 space-y-4 shadow-xl">
                    <div className="flex items-center justify-between border-b border-gray-800 pb-3">
                      <div className="flex items-center space-x-2">
                        <Video className="h-4 w-4 text-emerald-400" />
                        <span className="text-xs font-bold text-white tracking-wider uppercase">🎬 GCS 결과물 동영상 확인 및 다운로드</span>
                      </div>
                      {apiResponse?.gcs_url && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/20">
                          추출 완료 (GCS)
                        </span>
                      )}
                    </div>

                    {apiResponse?.gcs_url ? (
                      <div className="space-y-4">
                        <p className="text-xs text-gray-400 leading-relaxed">
                          Alpha Matting 또는 Object Removal 마스크 결과가 클라우드 스토리지(GCS)에 성공적으로 컴파일되었습니다. 아래 플레이어에서 직접 재생하거나 즉시 다운로드할 수 있습니다:
                        </p>
                        
                        {/* Native HTML5 Video Player */}
                        <div className="relative aspect-video rounded-xl overflow-hidden bg-black border border-gray-800 shadow-inner">
                          <video 
                            src={apiResponse.gcs_url} 
                            controls 
                            className="w-full h-full object-contain"
                            referrerPolicy="no-referrer"
                          />
                        </div>

                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gray-950 p-3.5 rounded-xl border border-gray-800/60 font-mono text-xs">
                          <div className="truncate pr-4 flex-1">
                            <div className="text-[9px] text-gray-500 uppercase tracking-wider">GCS Storage Path</div>
                            <div className="text-emerald-400 font-medium truncate mt-0.5" title={apiResponse.gcs_url}>
                              {apiResponse.gcs_url}
                            </div>
                          </div>
                          <a 
                            href={apiResponse.gcs_url} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold text-xs py-2 px-4 rounded-lg flex items-center justify-center shadow-lg shadow-emerald-500/20 transition duration-150 shrink-0"
                          >
                            <Download className="h-4 w-4 mr-1.5" />
                            동영상 다운로드 (MP4)
                          </a>
                        </div>

                        {/* Additional trigger to compile other view modes */}
                        <div className="pt-2 border-t border-gray-800/60">
                          <button
                            onClick={compileVideo}
                            disabled={compileLoading}
                            className={`w-full py-2.5 px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-2 border transition duration-150 ${
                              compileLoading 
                                ? "bg-gray-800 text-gray-400 border-gray-700 cursor-not-allowed" 
                                : "bg-gray-900 hover:bg-gray-850 text-emerald-400 border-gray-800 hover:border-emerald-500/30"
                            }`}
                          >
                            {compileLoading ? (
                              <>
                                <RefreshCw className="h-3.5 w-3.5 animate-spin text-emerald-400" />
                                <span>[{viewMode}] 모드로 새로운 동영상 제작 중 (10~20초 소요)...</span>
                              </>
                            ) : (
                              <>
                                <RefreshCw className="h-3.5 w-3.5 mr-1" />
                                <span>현재 뷰 [{viewMode}]로 동영상 새로 컴파일하기</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="flex flex-col items-center justify-center py-6 text-center text-gray-500 italic text-xs space-y-2 bg-gray-950/40 rounded-xl border border-gray-800/60">
                          <div className="h-8 w-8 rounded-full bg-gray-900/60 flex items-center justify-center mb-1 text-gray-600">
                            <Play className="h-4 w-4" />
                          </div>
                          <p className="max-w-md text-[11px] leading-relaxed text-gray-400 font-medium">
                            아직 컴파일된 결과 비디오가 없습니다. <br />
                            아래 버튼을 눌러 현재 활성화된 화면(<span className="text-emerald-400 font-semibold">{viewMode}</span>)을 기반으로 고화질 결과 비디오(.mp4)를 즉시 컴파일하고 클라우드(GCS)에 업로드할 수 있습니다!
                          </p>
                        </div>

                        <button
                          onClick={compileVideo}
                          disabled={compileLoading}
                          className={`w-full py-3 px-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2 border transition duration-150 shadow-lg ${
                            compileLoading 
                              ? "bg-gray-800 text-gray-400 border-gray-700 cursor-not-allowed" 
                              : "bg-emerald-500 hover:bg-emerald-400 text-black border-emerald-400 hover:scale-[1.01] active:scale-[0.99] shadow-emerald-500/15"
                          }`}
                        >
                          {compileLoading ? (
                            <>
                              <RefreshCw className="h-4 w-4 animate-spin text-emerald-400" />
                              <span>[{viewMode}] 모드로 동영상 제작 및 GCS 업로드 중...</span>
                            </>
                          ) : (
                            <>
                              <Video className="h-4 w-4" />
                              <span>[{viewMode}] 모드로 결과물 동영상 즉시 컴파일 및 업로드</span>
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Section: Step-by-Step Roto Pipeline Control Panel (Col-span 4) */}
                <div className="xl:col-span-4 space-y-5">
                  
                  {/* Step 1: Video Import */}
                  <div className="bg-[#161925] p-5 rounded-2xl border border-gray-800 space-y-4 shadow-lg">
                    <div className="flex items-center space-x-2 text-white font-semibold text-sm">
                      <span className="flex items-center justify-center h-5 w-5 rounded bg-emerald-500 text-black text-[10px] font-bold">1</span>
                      <span>Import raw video source</span>
                    </div>

                    <div className="border border-dashed border-gray-800 rounded-xl p-4 text-center bg-gray-950/20 space-y-3">
                      <div className="mx-auto w-8 h-8 rounded-full bg-gray-900 flex items-center justify-center">
                        <Video className="h-4 w-4 text-gray-400" />
                      </div>
                      <div className="space-y-0.5">
                        <p className="text-[11px] font-medium text-gray-300 max-w-xs truncate mx-auto">
                          {selectedFile ? selectedFile.name : "비디오 파일을 선택하세요"}
                        </p>
                        <p className="text-[9px] text-gray-500">MP4, MOV, WEBM format</p>
                      </div>
                      <div>
                        <label className="cursor-pointer inline-block bg-gray-800 hover:bg-gray-700 text-[11px] text-white font-medium px-3 py-1.5 rounded-lg border border-gray-700 transition">
                          Select Video
                          <input type="file" accept="video/*" onChange={handleFileChange} className="hidden" />
                        </label>
                      </div>
                    </div>

                    {/* Model Selector */}
                    <div className="space-y-1.5 pt-1">
                      <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                        AI SAM2 Model Selection
                      </label>
                      <select
                        value={selectedModel}
                        onChange={(e) => setSelectedModel(e.target.value)}
                        className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-2 text-xs text-gray-300 font-medium focus:outline-none focus:border-emerald-500/50"
                      >
                        <option value="Efficient">Efficient (Fast & Light, 114MB) - 추천</option>
                        <option value="Base">Base (Balanced, 353MB)</option>
                        <option value="Large">Large (Heavy & High-Accuracy, 638MB)</option>
                      </select>
                      <p className="text-[9px] text-gray-500 leading-normal">
                        💡 <strong>알림:</strong> 서버 CPU 환경 및 메모리 제한(OOM) 방지를 위해 <strong>Efficient</strong> 모델 사용을 적극 권장합니다.
                      </p>
                    </div>

                    <button
                      onClick={uploadVideoFile}
                      disabled={apiLoading || !selectedFile}
                      className={`w-full text-xs text-black disabled:text-gray-500 font-bold py-2 px-4 rounded-xl flex items-center justify-center space-x-2 transition ${
                        selectedFile && !isVideoUploaded 
                          ? "bg-emerald-500 hover:bg-emerald-600 animate-pulse border border-emerald-300/40" 
                          : "bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-800/80"
                      }`}
                    >
                      <Upload className="h-3.5 w-3.5" />
                      <span>{apiLoading ? "Uploading to Server..." : "Upload & Initialize Tracker"}</span>
                    </button>

                    {/* Highly Visible Error Alert */}
                    {testStatus && (testStatus.startsWith("Failed") || testStatus === "Network Error") && (
                      <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-xs space-y-1">
                        <div className="font-bold flex items-center">
                          <span className="mr-1.5">⚠️</span> 업로드 & 초기화 실패 (Initialization Failed)
                        </div>
                        <p className="font-mono text-[10px] break-all bg-black/30 p-2 rounded max-h-[100px] overflow-y-auto">
                          {typeof apiResponse === "string" 
                            ? apiResponse 
                            : apiResponse?.detail || apiResponse?.error || JSON.stringify(apiResponse)}
                        </p>
                        <div className="text-[9px] text-gray-400 leading-normal space-y-1">
                          <strong>💡 해결 팁:</strong>
                          <ul className="list-disc pl-3 space-y-0.5">
                            <li>모델을 <strong>'Efficient'</strong>로 변경하여 메모리 초과를 방지해 보세요.</li>
                            <li>프레임 수가 너무 많으면 타임아웃이 발생하므로, <strong>3~5초 이내의 짧은 비디오</strong>를 추천합니다.</li>
                            <li>클라우드런 서버가 콜드 스타트 중일 수 있으니 잠시 후 <strong>다시 시도</strong>해 보세요.</li>
                          </ul>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Step 2: Set Points & Clicks */}
                  <div className="bg-[#161925] p-5 rounded-2xl border border-gray-800 space-y-4 shadow-lg">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2 text-white font-semibold text-sm">
                        <span className="flex items-center justify-center h-5 w-5 rounded bg-emerald-500 text-black text-[10px] font-bold">2</span>
                        <span>Interactive Click Prompter</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          id="instantSegment"
                          checked={instantSegmentMode}
                          onChange={(e) => setInstantSegmentMode(e.target.checked)}
                          className="h-3.5 w-3.5 rounded bg-gray-900 border-gray-800 text-emerald-500 focus:ring-0 cursor-pointer"
                        />
                        <label htmlFor="instantSegment" className="text-[10px] text-emerald-400 select-none cursor-pointer font-bold">
                          즉시 전송
                        </label>
                      </div>
                    </div>

                    <div className="space-y-3">
                      {/* Active click coordinate feedback */}
                      <div className="grid grid-cols-2 gap-2 text-center bg-gray-950 p-3 rounded-xl border border-gray-800/60 font-mono text-xs">
                        <div>
                          <div className="text-[9px] text-gray-500">CLICK X</div>
                          <div className="text-white font-bold">{coordX} px</div>
                        </div>
                        <div>
                          <div className="text-[9px] text-gray-500">CLICK Y</div>
                          <div className="text-white font-bold">{coordY} px</div>
                        </div>
                      </div>

                      {/* Label Selector Toggle */}
                      <div>
                        <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-1.5">Click Prompt Type</label>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setLabelType(1)}
                            className={`py-1.5 text-xs rounded-lg font-bold border transition ${
                              labelType === 1 
                                ? "bg-emerald-500/10 border-emerald-500/50 text-emerald-400" 
                                : "bg-gray-900 border-gray-800 text-gray-400 hover:bg-gray-800"
                            }`}
                          >
                            🟢 Positive (Keep)
                          </button>
                          <button
                            type="button"
                            onClick={() => setLabelType(0)}
                            className={`py-1.5 text-xs rounded-lg font-bold border transition ${
                              labelType === 0 
                                ? "bg-rose-500/10 border-rose-500/50 text-rose-400" 
                                : "bg-gray-900 border-gray-800 text-gray-400 hover:bg-gray-800"
                            }`}
                          >
                            🔴 Negative (Erase)
                          </button>
                        </div>
                      </div>

                      {/* Manual Segment Button */}
                      {!instantSegmentMode && (
                        <button
                          onClick={() => submitSegmentPoint()}
                          disabled={apiLoading}
                          className="w-full bg-gray-800 hover:bg-gray-700 text-xs font-bold py-2 rounded-xl border border-gray-700 text-gray-200 transition"
                        >
                          Manual Segment Point [X, Y]
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Step 3: Propagation */}
                  <div className="bg-[#161925] p-5 rounded-2xl border border-gray-800 space-y-4 shadow-lg">
                    <div className="flex items-center space-x-2 text-white font-semibold text-sm">
                      <span className="flex items-center justify-center h-5 w-5 rounded bg-emerald-500 text-black text-[10px] font-bold">3</span>
                      <span>Propagate Tracking Over Time</span>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] text-gray-400 mb-1">Start Frame</label>
                        <input
                          type="text"
                          value={startFrame}
                          onChange={(e) => setStartFrame(e.target.value)}
                          className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-1.5 text-xs font-mono text-gray-200 focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-gray-400 mb-1">End Frame</label>
                        <input
                          type="text"
                          value={endFrame}
                          onChange={(e) => setEndFrame(e.target.value)}
                          className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-1.5 text-xs font-mono text-gray-200 focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                    </div>

                    <button
                      onClick={runPropagation}
                      disabled={apiLoading}
                      className="w-full bg-sky-500 hover:bg-sky-600 disabled:bg-gray-800 text-xs text-black disabled:text-gray-500 font-bold py-2 rounded-xl flex items-center justify-center space-x-1.5 transition"
                    >
                      <Play className="h-3 w-3" />
                      <span>Propagate Tracking Temporal Mask</span>
                    </button>
                  </div>

                  {/* Step 4: Alpha Matting / Removal */}
                  <div className="bg-[#161925] p-5 rounded-2xl border border-gray-800 space-y-4 shadow-lg">
                    <div className="flex items-center space-x-2 text-white font-semibold text-sm">
                      <span className="flex items-center justify-center h-5 w-5 rounded bg-emerald-500 text-black text-[10px] font-bold">4</span>
                      <span>Run Alpha Matting or Removal</span>
                    </div>

                    {/* Matting configuration */}
                    <div className="flex items-center space-x-2 bg-gray-950/40 p-2 rounded-lg border border-gray-800 text-[11px] text-gray-400">
                      <input
                        type="checkbox"
                        id="combinedMat"
                        checked={combinedMatting}
                        onChange={(e) => setCombinedMatting(e.target.checked)}
                        className="h-3 w-3 rounded bg-gray-900 border-gray-800 text-emerald-500 focus:ring-0"
                      />
                      <label htmlFor="combinedMat" className="cursor-pointer select-none">Combined Multi-Object Matting</label>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={runAlphaMattingPass}
                        disabled={apiLoading}
                        className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-800 text-[11px] text-white disabled:text-gray-500 font-bold py-2 rounded-xl transition"
                      >
                        Run Alpha Matte
                      </button>
                      <button
                        onClick={runBackgroundRemoval}
                        disabled={apiLoading}
                        className="bg-amber-600 hover:bg-amber-700 disabled:bg-gray-800 text-[11px] text-white disabled:text-gray-500 font-bold py-2 rounded-xl transition"
                      >
                        Inpaint / Remove
                      </button>
                    </div>
                  </div>

                </div>
              </div>

              {/* Logger Console & JSON API Response Panel */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Console Log */}
                <div className="lg:col-span-6 space-y-2">
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center">
                    <Activity className="h-3.5 w-3.5 mr-1.5 text-emerald-400" />
                    Simulation Log Output
                  </span>
                  <div className="bg-gray-950 rounded-xl p-4 border border-gray-800/80 font-mono text-xs h-[240px] overflow-y-auto flex flex-col justify-between">
                    <div className="space-y-1.5 text-gray-300">
                      {logs.map((log, index) => (
                        <p 
                          key={index} 
                          className={
                            log.includes("[Error]") ? "text-rose-400 font-medium" : 
                            log.includes("[Success]") ? "text-emerald-400" : 
                            log.includes("[Response]") ? "text-sky-300" : "text-gray-400"
                          }
                        >
                          {log}
                        </p>
                      ))}
                    </div>
                  </div>
                </div>

                {/* HTTP JSON View */}
                <div className="lg:col-span-6 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center">
                      <Code className="h-3.5 w-3.5 mr-1.5 text-sky-400" />
                      Live HTTP Response payload
                    </span>
                    {responseStatus && (
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                        responseStatus >= 200 && responseStatus < 300 ? "bg-emerald-400/15 text-emerald-400 border border-emerald-500/20" : "bg-rose-400/15 text-rose-400 border border-rose-500/20"
                      }`}>
                        HTTP {responseStatus}
                      </span>
                    )}
                  </div>
                  <div className="bg-gray-950 rounded-xl p-4 border border-gray-800/80 font-mono text-xs h-[240px] overflow-y-auto flex flex-col justify-between">
                    {apiResponse ? (
                      <div className="flex flex-col h-full justify-between">
                        <pre className="text-emerald-300 overflow-x-auto whitespace-pre-wrap flex-1">
                          {JSON.stringify(apiResponse, null, 2)}
                        </pre>
                        {(apiResponse.gcs_url || apiResponse.uploaded_gcs_url) && (
                          <div className="mt-4 pt-3 border-t border-gray-800 flex items-center justify-between">
                            <span className="text-[11px] text-gray-400">GCS Output Video:</span>
                            <a 
                              href={apiResponse.gcs_url || apiResponse.uploaded_gcs_url} 
                              target="_blank" 
                              rel="noopener noreferrer" 
                              className="bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-xs py-1.5 px-3.5 rounded-lg flex items-center shadow-lg shadow-emerald-500/20 transition duration-150"
                            >
                              <Download className="h-3.5 w-3.5 mr-1.5" />
                              Download Video
                            </a>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex-1 flex items-center justify-center text-gray-500 italic text-center text-xs">
                        {apiLoading ? "Fetching live response payload..." : "No active response. Execute an endpoint to inspect results."}
                      </div>
                    )}
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
              <span className="text-xs text-gray-400">Cloud Run Backend</span>
              <a 
                href={backendUrl} 
                target="_blank" 
                rel="noopener noreferrer" 
                className="text-xs font-mono text-sky-400 font-semibold hover:underline max-w-[150px] truncate"
                title={backendUrl}
              >
                sammie-backend
              </a>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
