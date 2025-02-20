import { useState } from "react";
import Upload from "./views/Upload";
import Player from "./views/Player";

function App() {
  const [currentMP3, setCurrentMP3] = useState(null);

  return (
    <div className="flex flex-col items-center justify-center h-screen w-screen bg-black relative pb-20 md:pb-0">
      {!currentMP3 ? (
        <>
        <Upload setCurrentMP3={setCurrentMP3} />
        <a
        href="https://github.com/umairair/sloverb"
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm font-medium bg-gradient-to-r from-blue-500 via-purple-500 to-red-500 bg-clip-text text-transparent hover:underline 
                   absolute bottom-4 md:fixed md:bottom-4 md:right-4 text-center md:text-right w-full md:w-auto"
      >
        <div className="flex flex-col justify-center items-center md:items-end space-y-1">
          <h1>created by umair</h1>
          <h2>(github repo)</h2>
        </div>
      </a>

        </>
        
      ) : (
        <Player  currentMP3={currentMP3} setCurrentMP3={setCurrentMP3} />
      )}


    </div>
  );
}

export default App;
