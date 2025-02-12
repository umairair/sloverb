import { useState } from "react";
import AudioUploader from "./components/AudioUploader";

function App() {
  return (
    <div className="flex items-center justify-center h-screen w-screen bg-gray-100">
      <AudioUploader />
    </div>
  );
}

export default App;
