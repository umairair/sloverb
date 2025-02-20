import { useState, useEffect } from "react";

const Upload = ({ setCurrentMP3 }) => {
  const [youtubeURL, setYoutubeURL] = useState("");
  const [loading, setLoading] = useState(false);

  const validateMP3 = (file) => {
    return file && file.type === "audio/mpeg";
  };



  const handleFileChange = (event) => {
    const selectedFile = event.target.files[0];
    if (validateMP3(selectedFile)) {
      setCurrentMP3(selectedFile);
    } else {
      alert("Only MP3 files are currently supported");
    }
  };

  const handleDragOver = (event) => {
    event.preventDefault();
  };

  const handleDrop = (event) => {
    event.preventDefault();
    const droppedFile = event.dataTransfer.files[0];
    if (validateMP3(droppedFile)) {
      setCurrentMP3(droppedFile);
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
      const response = await fetch("http://127.0.0.1:6969/download-youtube", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url: youtubeURL }),
      });

      if (!response.ok) {
        throw new Error("Failed to fetch MP3 file");
      }

      const blob = await response.blob();
      const mp3File = new File([blob], "downloaded.mp3", { type: "audio/mpeg" });
      setCurrentMP3(mp3File);
    } catch (error) {
      console.error("Error downloading MP3:", error);
      alert("Error downloading MP3");
    }

    setLoading(false);
  };

  return (
    <div className="flex flex-col items-center space-y-4 w-64">
      <div className="mb-5">
        <h1 className="text-5xl font-bold bg-gradient-to-r from-blue-500 via-purple-500 to-red-500 bg-clip-text text-transparent text-center mb-5">
          welcome to sloverb
        </h1>
        <h2 className="font-bold bg-gradient-to-r from-blue-500 via-purple-500 to-red-500 bg-clip-text text-transparent text-center">
          slow+reverb/nightcore, any song
        </h2>
      </div>

      <form onSubmit={handleDownload} className="w-full">
        <input
          type="text"
          placeholder="Enter YouTube URL"
          className="w-full p-2 border rounded-md"
          value={youtubeURL}
          onChange={(e) => setYoutubeURL(e.target.value)}
        />
        <button
          type="submit"
          disabled={loading}
          className={`w-full mt-2 p-2 text-white rounded-md flex items-center justify-center ${
            loading ? "bg-gray-400 cursor-not-allowed" : "bg-blue-500 hover:bg-blue-600"
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
              <span className="animate-pulse">Fetching...</span>
            </span>
          ) : (
            "Enter"
          )}
        </button>
      </form>

      <h3 className="text-2xl font-bold bg-gradient-to-r from-blue-500 via-purple-500 to-red-500 bg-clip-text text-transparent text-center">
        or
      </h3>


      <div
        className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-500 hover:bg-blue-100 transition p-4"
        onClick={() => document.getElementById("audio-upload").click()}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <input
          type="file"
          id="audio-upload"
          accept="audio/mpeg"
          className="hidden"
          onChange={handleFileChange}
        />
        <span className="text-gray-600 text-center">Upload MP3</span>
      </div>
    </div>
  );
};

export default Upload;
