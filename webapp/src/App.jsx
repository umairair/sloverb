import { useState } from "react";
import Upload from "./views/Upload";
import Player from "./views/Player";

function App() {
  const [currentMP3, setCurrentMP3] = useState(null);

  return (
    <div className="flex items-center justify-center h-screen w-screen bg-dark">
      {!currentMP3? <Upload setCurrentMP3={setCurrentMP3}/>: <Player currentMP3={currentMP3} setCurrentMP3={setCurrentMP3}/>}
    </div>
  );
}

export default App;