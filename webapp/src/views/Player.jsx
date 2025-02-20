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

    function seekForward() {
        if (!playerRef.current) return;
        const newTime = Math.min(playerRef.current.buffer.duration, Tone.Transport.seconds + 10);
        setPlaybackPosition(newTime);
        Tone.Transport.seconds = newTime;
        if (isPlaying) {
            playerRef.current.stop();
            playerRef.current.start(0, newTime);
        }
    }

    function seekBack() {
        if (!playerRef.current) return;
        const newTime = Math.max(0, Tone.Transport.seconds - 10);
        setPlaybackPosition(newTime);
        Tone.Transport.seconds = newTime;
        if (isPlaying) {
            playerRef.current.stop();
            playerRef.current.start(0, newTime);
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

        if (logValue < 1.0) {
            setShowReverbSlider(true);
            
        } else {
            reverbRef.current.wet.value = 0;
            setShowReverbSlider(false);
            setReverbLevel(0);
            
           
        }
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
        // get duration of mp3 and calculate new duration after adjusting playback rate

        
            //get duration of mp3
            const duration = await getMP3DurationWebAudio(currentMP3);


            console.log("MP3 Duration:", duration, "seconds");

            //calculate new duration based on playback rate
            const newDuration = duration/playerRef.current.playbackRate;
            console.log(newDuration)

            //use tonejs offline to export the audio with the user selected playback speed, and reverb. 

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

            try {
                const response = await fetch("http://localhost:6969/upload-audio", {
                    method: "POST",
                    body: formData
                });

                const result = await response.json();
                console.log("Server Response:", result);
            } catch (error) {
                console.error("Error sending audio to server:", error);
            }

          
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
                <div className="flex flex-col items-center space-y-6 p-6 sm:p-8 w-full max-w-lg">
                    
                    <Animation isPlaying={isPlaying} />
    
                    <div className="flex flex-wrap justify-center space-x-2 sm:space-x-4">
                        <button type="button" onClick={seekBack} className="px-6 py-2 min-w-[90px] text-white bg-gray-700 bg-opacity-40 rounded-lg shadow-md hover:bg-gray-600 transition duration-300">
                            -10s
                        </button>
                        <button type="button" onClick={seekForward} className="px-6 py-2 min-w-[90px] text-white bg-gray-700 bg-opacity-40 rounded-lg shadow-md hover:bg-gray-600 transition duration-300">
                            +10s
                        </button>
                        <button type="button" onClick={handleToggle} className="px-6 py-2 min-w-[90px] text-white rounded-lg shadow-md bg-gradient-to-r from-blue-500 to-purple-600 hover:scale-105 transition duration-300">
                            {isPlaying ? "Pause" : "Play"}
                        </button>
                        <button type="button" onClick={seekForward} className="px-6 py-2 min-w-[90px] text-white bg-gray-700 bg-opacity-40 rounded-lg shadow-md hover:bg-gray-600 transition duration-300">
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
    
                    <div className={`w-full max-w-lg text-center ${showReverbSlider ? "" : "invisible"}`}>
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
                        <div className="relative h-12 flex items-center">
                            <div className="absolute inset-0 flex pointer-events-none">
                                <div className="w-1/2 bg-blue-500 h-12 rounded-l-lg flex justify-center items-center shadow-md">
                                    <span className="text-white font-semibold text-sm">slow + reverb</span>
                                </div>
                                <div className="w-1/2 bg-pink-500 h-12 rounded-r-lg flex justify-center items-center shadow-md">
                                    <span className="text-white font-semibold text-sm">nightcore</span>
                                </div>
                            </div>
    
                            <input
                                type="range"
                                min="0"
                                max="2"
                                step="0.01"
                                value={linearPlaybackRate}
                                onChange={handlePlaybackChange}
                                className="absolute w-full h-12 bg-transparent cursor-pointer z-10"
                                style={{
                                    WebkitAppearance: "none",
                                    appearance: "none",
                                }}
                            />
                        </div>
                    </div>
    
                    <div className="flex flex-wrap justify-center space-x-2 sm:space-x-4">
                        <button
                            type="button"
                            onClick={() => {
                                setCurrentMP3(null);
                                playerRef.current.disconnect();
                            }}
                            className="px-6 py-2 min-w-[90px] bg-red-500 text-white rounded-lg shadow-md hover:scale-105 transition duration-300"
                        >
                            Back
                        </button>
                        <button
                            type="button"
                            onClick={resetSlider}
                            className="px-6 py-2 min-w-[90px] bg-yellow-500 text-white rounded-lg shadow-md hover:scale-105 transition duration-300"
                        >
                            Reset
                        </button>
                        <button onClick={handleDownload} className="px-6 py-2 min-w-[90px] bg-green-500 text-white rounded-lg shadow-md hover:scale-105 transition duration-300">
                            Save
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
