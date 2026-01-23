import { useState, useRef } from "react";

const Upload = ({ setCurrentMP3 }) => {
  const [youtubeURL, setYoutubeURL] = useState("");
  const [loading, setLoading] = useState(false);
  const [showDisabledTip, setShowDisabledTip] = useState(false);
  const tipTimeoutRef = useRef(null);

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setYoutubeURL(text);
    } catch (error) {
      alert("Failed to access clipboard. Please paste manually.");
    }
  };

  const validateMP3 = (file) => file && file.type === "audio/mpeg";

  const handleFileChange = (event) => {
    const selectedFile = event.target.files[0];
    if (validateMP3(selectedFile)) {
      setCurrentMP3(selectedFile);
    } else {
      alert("Only MP3 files are currently supported");
    }
  };

  const handlePickSample = async (path, name) => {
    try {
      const res = await fetch(path);
      if (!res.ok) throw new Error("Failed to load sample");
      const blob = await res.blob();
      const file = new File([blob], name || path.split("/").pop(), {
        type: "audio/mpeg",
      });
      setCurrentMP3(file);
    } catch (e) {
      alert("Could not load sample. Please try upload instead.");
    }
  };

  const handleDownload = async (event) => {
    event.preventDefault();
    if (!youtubeURL.trim()) {
      alert("Please enter a valid YouTube URL");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("https://api.sloverb.app:8080/download-youtube", {
        // const response = await fetch("http://127.0.0.1:8080/download-youtube", {

        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: youtubeURL }),
      });

      if (!response.ok) throw new Error("Failed to fetch MP3 file");

      const blob = await response.blob();
      setCurrentMP3(new File([blob], "downloaded.mp3", { type: "audio/mpeg" }));
    } catch (error) {
      alert("Error downloading MP3");
    }
    setLoading(false);
  };

  const handleShowDisabledTip = () => {
    if (tipTimeoutRef.current) clearTimeout(tipTimeoutRef.current);
    setShowDisabledTip(true);
    tipTimeoutRef.current = setTimeout(() => setShowDisabledTip(false), 2000);
  };

  return (
    <div className="relative flex flex-col items-center space-y-6 w-72 pb-8">
      <div className="text-center">
        <h1 className="text-5xl font-bold bg-gradient-to-r from-blue-500 via-purple-500 to-red-500 bg-clip-text text-transparent leading-tight">
          welcome to sloverb
        </h1>
        <h2 className="font-bold bg-gradient-to-r from-blue-500 via-purple-500 to-red-500 bg-clip-text text-transparent text-lg mt-3 whitespace-nowrap">
          slow+reverb/nightcore for any song
        </h2>
      </div>

      {/* YouTube to MP3 (temporarily unavailable) */}
      <form onSubmit={(e) => e.preventDefault()} className="relative w-full group">
        {/* Content (dimmed) */}
        <div className="relative w-full bg-gray-900 rounded-xl p-1 shadow-md opacity-50 grayscale">
          <input
            type="text"
            placeholder="Enter YouTube URL"
            className="w-full p-3 text-white bg-gray-800 rounded-xl focus:outline-none placeholder-gray-400 pr-20"
            value={youtubeURL}
            onChange={(e) => setYoutubeURL(e.target.value)}
            disabled
            aria-disabled="true"
          />
          <button
            type="button"
            onClick={handlePaste}
            disabled
            aria-disabled="true"
            className="absolute right-3 top-1/2 transform -translate-y-1/2 px-4 py-1 text-white font-medium rounded-md bg-gradient-to-r from-blue-500 via-purple-500 to-red-500 opacity-70 cursor-not-allowed transition-all shadow-md"
          >
            Paste
          </button>
        </div>

        <button
          type="button"
          disabled
          aria-disabled="true"
          className="w-full mt-3 p-3 text-white rounded-xl font-medium flex items-center justify-center transition-all shadow-md bg-gradient-to-r from-blue-500 via-purple-500 to-red-500 opacity-70 cursor-not-allowed"
        >
          Enter
        </button>

        {/* Interaction-capturing overlay with tooltip */}
        <button
          type="button"
          aria-label="YouTube to MP3 is unavailable. Please upload your MP3."
          onClick={handleShowDisabledTip}
          onMouseEnter={() => setShowDisabledTip(true)}
          onMouseLeave={() => setShowDisabledTip(false)}
          className="absolute inset-0 z-10 rounded-xl focus:outline-none"
        >
          {/* Tooltip */}
          <div
            className={`pointer-events-none absolute -top-2 left-1/2 -translate-x-1/2 -translate-y-full px-3 py-2 text-xs sm:text-sm text-gray-100 bg-gray-800/95 rounded-lg shadow-lg ring-1 ring-white/10 transition-opacity duration-150 ${
              showDisabledTip ? "opacity-100" : "opacity-0 group-hover:opacity-100"
            }`}
          >
            <span className="block text-center">
              YouTube to MP3 isn’t available yet.
              <br className="hidden sm:block" />
              Please upload your own MP3 instead.
            </span>
            <span className="absolute left-1/2 -bottom-1 h-2 w-2 -translate-x-1/2 rotate-45 bg-gray-800/95"></span>
          </div>
        </button>
      </form>

      <h3 className="text-2xl font-bold bg-gradient-to-r from-blue-500 via-purple-500 to-red-500 bg-clip-text text-transparent">
        or
      </h3>

      {/* Sample songs - Eye-catching section for recruiters */}
      <div className="w-full rounded-xl bg-gradient-to-br from-purple-900/30 to-blue-900/20 p-3 border border-purple-500/30">
        <div className="text-white text-sm font-semibold text-center mb-2">Try a Sample</div>
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => handlePickSample("/espresso.mp3", "espresso.mp3")}
            className="flex flex-col items-center justify-center h-20 sm:h-24 rounded-lg bg-gradient-to-b from-gray-800 to-gray-900 hover:from-blue-800 hover:to-blue-900 transition shadow-md ring-1 ring-white/20 hover:ring-blue-400/50"
            aria-label="Play sample: Espresso by Sabrina Carpenter"
          >
            <span className="text-2xl mb-1">☕</span>
            <div className="text-center">
              <div className="text-white text-xs font-semibold">Espresso</div>
              <div className="text-gray-400 text-[10px]">Sabrina</div>
            </div>
          </button>
          <button
            type="button"
            onClick={() => handlePickSample("/allthestars.mp3", "allthestars.mp3")}
            className="flex flex-col items-center justify-center h-20 sm:h-24 rounded-lg bg-gradient-to-b from-gray-800 to-gray-900 hover:from-purple-800 hover:to-purple-900 transition shadow-md ring-1 ring-white/20 hover:ring-purple-400/50"
            aria-label="Play sample: All the Stars by SZA and Kendrick Lamar"
          >
            <span className="text-2xl mb-1">⭐</span>
            <div className="text-center">
              <div className="text-white text-xs font-semibold">All the Stars</div>
              <div className="text-gray-400 text-[10px]">SZA & Kendrick</div>
            </div>
          </button>
          <button
            type="button"
            onClick={() => handlePickSample("/timeless.mp3", "timeless.mp3")}
            className="flex flex-col items-center justify-center h-20 sm:h-24 rounded-lg bg-gradient-to-b from-gray-800 to-gray-900 hover:from-red-800 hover:to-red-900 transition shadow-md ring-1 ring-white/20 hover:ring-red-400/50"
            aria-label="Play sample: Timeless by The Weeknd"
          >
            <span className="text-2xl mb-1">⏰</span>
            <div className="text-center">
              <div className="text-white text-xs font-semibold">Timeless</div>
              <div className="text-gray-400 text-[10px]">The Weeknd</div>
            </div>
          </button>
        </div>
      </div>

      <h3 className="text-2xl font-bold bg-gradient-to-r from-blue-500 via-purple-500 to-red-500 bg-clip-text text-transparent">
        or
      </h3>

      <div
        className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-500 rounded-xl cursor-pointer hover:border-blue-500 hover:bg-blue-900 transition p-4 text-white"
        onClick={() => document.getElementById("audio-upload").click()}
      >
        <input
          type="file"
          id="audio-upload"
          accept="audio/mpeg"
          className="hidden"
          onChange={handleFileChange}
        />
        <span className="text-gray-300">Upload MP3</span>
      </div>
      
            <div className="absolute bottom-1 left-0 right-0 text-center text-sm text-gray-300 opacity-50 pointer-events-none">
                  On iOS? Make sure silent mode is off. 🔊
          </div>
      
    </div>
  );
};

export default Upload;
