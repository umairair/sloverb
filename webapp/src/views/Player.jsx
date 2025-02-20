import { useState, useEffect, useRef } from "react";
import * as Tone from "tone";
import Animation from "../components/Animation";
import { CirclePlay } from 'lucide-react';

export default function Player({currentMP3, setCurrentMP3 }) {
    const playerRef = useRef(null);
    const reverbRef = useRef(null);

    const [isPlaying, setIsPlaying] = useState(false);
    const [playbackPosition, setPlaybackPosition] = useState(0);
    const [volume, setVolume] = useState(0);
    const [showPlayer, setshowPlayer] = useState(false);

    const [linearPlaybackRate, setLinearPlaybackRate] = useState(1);
    const [playbackRate, setPlaybackRate] = useState(1);

    const [showReverbSlider, setShowReverbSlider] = useState(false);
    const [reverbLevel, setReverbLevel] = useState(0);

    const [loading, setLoading] = useState(false); 
    
    useEffect(() => {
        if (currentMP3) {
            const url = URL.createObjectURL(currentMP3);
            const reverb = new Tone.Reverb({ decay: 4.5, wet: 0 }).toDestination();
            const player = new Tone.Player({url: url, loop:true})

            player.connect(reverb)
            player.grainSize = 0.2; 
            player.overlap = 0.1; 
            playerRef.current = player;
            reverbRef.current = reverb;
            

            return () => {
                URL.revokeObjectURL(url); 
            };
        }
    }, [currentMP3]); 

    async function handleToggle() {
        await Tone.start();

        if (!playerRef.current || !playerRef.current.buffer.loaded) {
            
            return;
        }

        if (!isPlaying) {
            
            if (playerRef.current.state !== "started") {


                playerRef.current.start(0, playbackPosition);
                Tone.Transport.start();
                setshowPlayer(true);
            }
            setIsPlaying(true);
        } else {
            
            setPlaybackPosition(Tone.Transport.seconds);
            if (playerRef.current.state === "started") {
                playerRef.current.stop();
            }
            Tone.Transport.pause();
            setIsPlaying(false);
        }
    }
    function seekBack() {
        if (!playerRef.current) return;
        const newTime = Math.max(0, playerRef.current.seek() - 10);
        setPlaybackPosition(newTime);
        if (isPlaying) {
            playerRef.current.stop();
            playerRef.current.start(0, newTime);
        }
    }
    
    function seekForward() {
        if (!playerRef.current) return;
        const newTime = Math.min(playerRef.current.buffer.duration, playerRef.current.seek() + 10);
        setPlaybackPosition(newTime);
        if (isPlaying) {
            playerRef.current.stop();
            playerRef.current.start(0, newTime);
        }
    }
    
    
    function restartPlayback() {
        if (!playerRef.current) return;
        setPlaybackPosition(0);
        if (isPlaying) {
            playerRef.current.stop();
            playerRef.current.start(0, 0);
        }
    }
    

    useEffect(() => {
        if (playerRef.current) {
            playerRef.current.volume.value = volume;
        }
    }, [volume]);

    useEffect(() => {
        if (playerRef.current) {
            playerRef.current.playbackRate = playbackRate;
        }
    }, [playbackRate]);

    const handlePlaybackChange = (e) => {
        const linearValue = parseFloat(e.target.value);
        const logValue = Math.pow(2, (linearValue - 1));

        setLinearPlaybackRate(linearValue);
        setPlaybackRate(logValue);


    };

    const handleReverbChange = (event) => {
        let wet = event.target.value;
     

        if(wet == 0.2) {
            reverbRef.current.wet.value = 0;
            setReverbLevel(0);
            

        }
        else {
            reverbRef.current.wet.value = event.target.value;
            setReverbLevel(event.target.value)
            
        }

    };

    const resetSlider = () => {
        setLinearPlaybackRate(1);
        setPlaybackRate(1);
        reverbRef.current.wet.value = 0;
        setShowReverbSlider(false);
        setReverbLevel(0);
        
    };


    const getMP3DurationWebAudio = (file) => {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          
          reader.readAsArrayBuffer(file);
          reader.onload = () => {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            audioContext.decodeAudioData(reader.result, (buffer) => {
              resolve(buffer.duration);
            }, (err) => reject(err));
          };
      
          reader.onerror = () => reject("Error reading file");
        });
      };



        

     

      async function handleDownload(event) {
          event.preventDefault(); 
      
          setLoading(true); 
      
          try {
              const duration = await getMP3DurationWebAudio(currentMP3);
              console.log("MP3 Duration:", duration, "seconds");
      
              const newDuration = duration / playerRef.current.playbackRate;
              console.log(newDuration);
      
              const buffer = await Tone.Offline(async () => {
                  const url = URL.createObjectURL(currentMP3);
                  const reverb = new Tone.Reverb({ decay: 4.5, wet: reverbLevel }).toDestination();
                  const player = new Tone.Player().connect(reverb);
      
                  await player.load(url); 
      
                  player.playbackRate = playbackRate;
                  player.grainSize = 0.2;
                  player.overlap = 0.1;
      
                  player.start(0);
                  await Tone.loaded(); 
              }, newDuration);
      
              console.log("Rendered buffer:", buffer);
      
              const rawAudioData = buffer.getChannelData(0);
              const audioArrayBuffer = rawAudioData.buffer;
              const blob = new Blob([audioArrayBuffer], { type: "application/octet-stream" });
      
              const formData = new FormData();
              formData.append("audio", blob, "audio.raw");
      
              const response = await fetch("http://localhost:6969/upload-audio", {
                  method: "POST",
                  body: formData
              });
      
              if (!response.ok) {
                  throw new Error(`HTTP error! Status: ${response.status}`);
              }
      
              const blobResponse = await response.blob();
              const audioURL = URL.createObjectURL(blobResponse);
      
              
      
              const a = document.createElement("a");
              a.href = audioURL;
              a.download = "audio.wav"; 
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a); 
      
          } catch (error) {
            //   console.error("Error sending audio to server:", error);
          }
      
          setLoading(false);
      }
      
    

    return (
        <>
            {!showPlayer ? (
                <div className="flex flex-col items-center space-y-4">
                    <CirclePlay
                        className="cursor-pointer"
                        size="114"
                        color="white"
                        onClick={handleToggle}
                    />
                    <div className="overflow-visible">
                        <h1 className="text-4xl font-extrabold bg-gradient-to-r from-blue-500 via-purple-500 to-red-500 bg-clip-text text-transparent text-center relative animate-[epicFloat_6s_ease-in-out_infinite] leading-[1.2] pb-2">
                            start the player
                        </h1>
                    </div>
                </div>
            ) : (
                <div className="flex flex-col items-center space-y-6 p-6 sm:p-8 w-full max-w-lg min-h-screen bg-black">

                    
                    <Animation isPlaying={isPlaying} />
    
                    <div className="flex flex-wrap justify-center gap-2 sm:gap-4">

                        <button type="button" onClick={seekBack} className="px-6 py-2 min-w-[90px] text-white bg-gray-700 bg-opacity-40 rounded-lg shadow-md hover:bg-gray-600 transition duration-300">
                            -10s
                        </button>
                        <button type="button" onClick={handleToggle} className="px-6 py-2 min-w-[90px] text-white rounded-lg shadow-md bg-gradient-to-r from-blue-500 to-purple-600 hover:scale-105 transition duration-300">
                            {isPlaying ? "Pause" : "Play"}
                        </button>
                        <button type="button" onClick={seekForward} className="px-6 py-2 min-w-[90px] text-white bg-gray-700 bg-opacity-40 rounded-lg shadow-md hover:bg-gray-600 transition duration-300">
                            +10s
                        </button>

                        <button type="button" onClick={restartPlayback} className="px-6 py-2 min-w-[90px] text-white bg-gray-700 bg-opacity-40 rounded-lg shadow-md hover:bg-gray-600 transition duration-300">
                            Restart
                        </button>
                    </div>
    
                    <div className="w-full max-w-lg text-center">
                        <label className="block text-sm font-medium text-white">Volume</label>
                        <input
                            type="range"
                            min="-60"
                            max="0"
                            value={volume}
                            onChange={(event) => setVolume(parseFloat(event.target.value))}
                            className="w-full accent-blue-500 cursor-pointer"
                        />
                    </div>
    
                    <div className="w-full max-w-lg text-center">
                        <label className="block text-sm font-medium text-white">Reverb</label>
                        <input
                            type="range"
                            min="0.2"
                            max="0.8"
                            step="0.01"
                            value={reverbLevel}
                            onChange={handleReverbChange}
                            className="w-full accent-purple-500 cursor-pointer"
                        />
                    </div>
                    <div className="relative w-full max-w-lg">
    <div className="relative h-12 flex items-center rounded-lg overflow-hidden shadow-lg">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 h-12 rounded-lg blur-sm opacity-70" />
        <div className="absolute inset-0 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 h-12 rounded-lg opacity-90" />

        <input
            type="range"
            min="0"
            max="2"
            step="0.01"
            value={linearPlaybackRate}
            onChange={handlePlaybackChange}
            className="absolute w-full h-12 bg-transparent appearance-none z-10 cursor-pointer"
            style={{
                WebkitAppearance: "none",
                appearance: "none",
                outline: "none",
            }}
        />

        
        <style jsx>{`
            input[type="range"]::-webkit-slider-thumb {
                -webkit-appearance: none;
                appearance: none;
                width: 24px;
                height: 24px;
                background: radial-gradient(circle, #ffffff 20%, rgba(255, 255, 255, 0.3) 50%, transparent 60%);
                border: 2px solid white;
                border-radius: 50%;
                box-shadow: 0 0 12px rgba(255, 255, 255, 0.7);
                transition: transform 0.1s ease-in-out;
            }

            input[type="range"]:active::-webkit-slider-thumb {
                transform: scale(1.2);
                box-shadow: 0 0 16px rgba(255, 255, 255, 1);
            }
        `}</style>
    </div>
</div>

    
                    <div className="flex flex-wrap justify-center space-x-2 sm:space-x-4">
                        <button
                            type="button"
                            onClick={() => {
                                setCurrentMP3(null);
                                playerRef.current.disconnect();
                            }}
                            className="px-6 py-2 min-w-[90px] bg-fuchsia-800 text-white rounded-lg shadow-md hover:scale-105 transition duration-300"
                        >
                            Back
                        </button>

                        <button type="button" onClick={resetSlider} className="px-6 py-2 min-w-[90px] text-white rounded-lg shadow-md bg-gradient-to-r from-blue-500 to-purple-600 hover:scale-105 transition duration-300">
                            Reset
                        </button>
                        <button
    onClick={handleDownload}
    className="px-6 py-2 min-w-[90px] bg-emerald-800 text-white rounded-lg shadow-md hover:scale-105 transition duration-300"
    disabled={loading} 
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
            <span className="animate-pulse">Processing...</span>
        </span>
    ) : (
        "Save"
    )}
</button>

                    </div>
    
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
                </div>
            )}
        </>
    );
    
    
}
