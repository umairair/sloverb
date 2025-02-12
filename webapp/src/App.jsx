import { useState } from "react";
import AudioUploader from "./components/AudioUploader";

function App() {
  const [currentMP3, setCurrentMP3] = useState(null);

  return (
    <div className="flex items-center justify-center h-screen w-screen bg-gray-200">
      {!currentMP3? <AudioUploader setCurrentMP3={setCurrentMP3}/>: null}
    </div>
  );
}

export default App;
