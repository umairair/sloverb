import { useState } from "react";
import Upload from "./views/Upload";
import Edit from "./views/Edit";

function App() {
  const [currentMP3, setCurrentMP3] = useState(null);

  return (
    <div className="flex items-center justify-center h-screen w-screen bg-neutral-800">
      {!currentMP3? <Upload setCurrentMP3={setCurrentMP3}/>: <Edit currentMP3={currentMP3} setCurrentMP3={setCurrentMP3}/>}
    </div>
  );
}

export default App;