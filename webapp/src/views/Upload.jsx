import { useState } from "react";

const Upload = ({ setCurrentMP3 }) => {
  const [youtubeURL, setYoutubeURL] = useState("");
  const [loading, setLoading] = useState(false);

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

  const handleDownload = async (event) => {
    event.preventDefault();
    if (!youtubeURL.trim()) {
      alert("Please enter a valid YouTube URL");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("http://107.189.19.45:8080/download-youtube", {
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

  return (
    <div className="flex flex-col items-center space-y-6 w-72">
      <div className="text-center">
        <h1 className="text-5xl font-bold bg-gradient-to-r from-blue-500 via-purple-500 to-red-500 bg-clip-text text-transparent leading-tight">
          welcome to sloverb
        </h1>
        <h2 className="font-bold bg-gradient-to-r from-blue-500 via-purple-500 to-red-500 bg-clip-text text-transparent text-lg mt-3 whitespace-nowrap">
          slow+reverb/nightcore for any song
        </h2>
      </div>

      <form onSubmit={handleDownload} className="relative w-full">
        <div className="relative w-full bg-gray-900 rounded-xl p-1 shadow-md">
          <input
            type="text"
            placeholder="Enter YouTube URL"
            className="w-full p-3 text-white bg-gray-800 rounded-xl focus:outline-none placeholder-gray-400 pr-20"
            value={youtubeURL}
            onChange={(e) => setYoutubeURL(e.target.value)}
          />
          <button
            type="button"
            onClick={handlePaste}
            className="absolute right-3 top-1/2 transform -translate-y-1/2 px-4 py-1 text-white font-medium rounded-md bg-gradient-to-r from-blue-500 via-purple-500 to-red-500 hover:opacity-80 transition-all shadow-md"
          >
            Paste
          </button>
        </div>

        <button
          type="submit"
          disabled={loading}
          className={`w-full mt-3 p-3 text-white rounded-xl font-medium flex items-center justify-center transition-all shadow-md ${
            loading
              ? "bg-gray-600 cursor-not-allowed"
              : "bg-gradient-to-r from-blue-500 via-purple-500 to-red-500 hover:opacity-80"
          }`}
        >
          {loading ? (
            <span className="flex items-center space-x-2">
              <svg
                className="animate-spin h-5 w-5 text-white"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8v2.5a5.5 5.5 0 00-5.5 5.5H4z"
                ></path>
              </svg>
              <span className="animate-pulse">this may take a while...</span>
            </span>
          ) : (
            "Enter"
          )}
        </button>
      </form>

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
