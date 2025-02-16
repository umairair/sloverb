
const Upload = ({ setCurrentMP3 }) => {
  const validateMP3 = (file) => {
    return file && file.type === "audio/mpeg";
  };

  const handleFileChange = (event) => {
    const selectedFile = event.target.files[0];
    if (validateMP3(selectedFile)) {
      setCurrentMP3(selectedFile);
    } else {
      alert("only mp3 files are currently supported");
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
      alert("only mp3 files are currently supported");
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
        accept="audio/mpeg"
        className="hidden"
        onChange={handleFileChange}
      />
      <span className="text-gray-600 text-center">
        upload
      </span>
    </div>
  );
};

export default Upload;
