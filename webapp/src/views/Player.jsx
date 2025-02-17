import { useState, useEffect, useRef } from "react";
import * as Tone from "tone";
import Animation from "../components/Animation";

export default function Player({currentMP3, setCurrentMP3 }) {
    const playerRef = useRef(null);

    const [isPlaying, setIsPlaying] = useState(false);
    const [playbackPosition, setPlaybackPosition] = useState(0);
    const [volume, setVolume] = useState(0);
    const [showAnimation, setShowAnimation] = useState(false);

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
                setShowAnimation(true);
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
            setShowReverbSlider(false);
           
        }
    };

    const handleReverbChange = (event) => {
        
        console.log(event.target.value)
        setReverbLevel(event.target.value)
        

    };

    const resetSlider = () => {
        setLinearPlaybackRate(1);
        setPlaybackRate(1);
        setShowReverbSlider(false);
        setReverbLevel(0);
        //reverbRef.current.wet.value = 0;
    };

    return (
        <div className="flex flex-col items-center space-y-4 p-6">
            <button className="bg-red-400" type="button" onClick={() => {
                setCurrentMP3(null);
                playerRef.current.disconnect();

                }}>{currentMP3.name
            }</button>

            <button type="button" onClick={handleToggle} className="px-6 py-2 bg-blue-500 text-white rounded-md">
                {isPlaying ? "Pause" : "Play"}
            </button>
            <div className="flex space-x-4">
                <button type="button" onClick={seekBack} className="px-4 py-2 bg-gray-500 text-white rounded-md">-10s</button>
                <button type="button" onClick={seekForward} className="px-4 py-2 bg-gray-500 text-white rounded-md">+10s</button>
            </div>

            <input
                type="range"
                min="-60"
                max="0"
                value={volume}
                onChange={(event) => setVolume(parseFloat(event.target.value))}
                className="w-64"
            />

            {showAnimation ? <Animation isPlaying={isPlaying} /> : null}

            
            <div className="relative w-full max-w-lg mt-6">
                <div className="relative">
                  
                    <div className="absolute inset-0 flex">
                        <div className="w-1/2 bg-blue-500 h-10 rounded-l-lg flex justify-center items-center">
                            <span className="text-white font-semibold text-sm">slow + reverb</span>
                        </div>
                        <div className="w-1/2 bg-pink-500 h-10 rounded-r-lg flex justify-center items-center">
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
                        className="relative w-full appearance-none h-10 bg-transparent cursor-pointer"
                        style={{
                            WebkitAppearance: "none",
                            appearance: "none",
                            zIndex: 10,
                        }}
                    />
                </div>
            </div>

           
            <button
                type="button"
                onClick={resetSlider}
                className="px-6 py-2 bg-red-500 text-white rounded-md"
            >
                Reset
            </button>

            {showReverbSlider && (
                <div className="mt-4 w-64">
                    <label className="block text-sm font-medium text-center">Reverb</label>
                    <input
                        type="range"
                        min="0"
                        max="0.6"
                        step="0.01"
                        value={reverbLevel}
                        onChange={handleReverbChange}
                        className="w-full"
                    />
                   
                </div>
            )}
        </div>
    );
}
