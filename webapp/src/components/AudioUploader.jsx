import { useState } from "react";

const AudioUploader = () => {
  const [file, setFile] = useState(null);

  const handleFileChange = (event) => {
    const selectedFile = event.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
    }
  };

  const handleDragOver = (event) => {
    event.preventDefault();
  };

  const handleDrop = (event) => {
    event.preventDefault();
    const droppedFile = event.dataTransfer.files[0];
    if (droppedFile) {
      setFile(droppedFile);
    }
  };

  return (
    <div
      className="flex flex-col items-center justify-center w-64 h-32 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-500 hover:bg-blue-100 transition p-4"
      onClick={() => document.getElementById("audio-upload").click()}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <input
        type="file"
        id="audio-upload"
        accept="audio/*"
        className="hidden"
        onChange={handleFileChange}
      />
      <span className="text-gray-600 text-center">
        {file ? `Selected: ${file.name}` : "Click or Drag to Upload"}
      </span>
    </div>
  );
};

export default AudioUploader;
