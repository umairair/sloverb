import { useState, useEffect } from "react";
import * as Tone from "tone";
import Animation from "./Animation";

export default function Player({ playerRef }) {
    const [isPlaying, setIsPlaying] = useState(false);
    const [playbackPosition, setPlaybackPosition] = useState(0);
    const [volume, setVolume] = useState(0);
    const [showAnimation, setShowAnimation] = useState(false);


    const [linearPlaybackRate, setLinearPlaybackRate] = useState(1); 
    const [playbackRate, setPlaybackRate] = useState(1);

    async function handleToggle() {
        await Tone.start();

        if (!isPlaying) {
            console.log(playerRef.current.playbackRate);
            if (Tone.Transport.state !== "started") {
                Tone.Transport.start();
                playerRef.current.start(0, playbackPosition);
                setShowAnimation(true);
            } else {
                Tone.Transport.seconds = playbackPosition;
                playerRef.current.start(0, playbackPosition);
            }
            setIsPlaying(true);
        } else {
            setPlaybackPosition(Tone.Transport.seconds);
            playerRef.current.stop();
            Tone.Transport.pause();
            setIsPlaying(false);
        }
    }

    function seekForward() {
        const newTime = Math.min(playerRef.current.buffer.duration, Tone.Transport.seconds + 10);
        setPlaybackPosition(newTime);
        Tone.Transport.seconds = newTime;
        if (isPlaying) {
            playerRef.current.stop();
            playerRef.current.start(0, newTime);
        }
    }

    function seekBack() {
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
    };

    return (
        <div className="flex flex-col">
            <button type="button" onClick={handleToggle}>
                {isPlaying ? "Pause" : "Play"}
            </button>
            <button type="button" onClick={seekForward}>Skip 10s forward</button>
            <button type="button" onClick={seekBack}>Go 10s back</button>


            <input
                type="range"
                min="-60"
                max="0"
                value={volume}
                onChange={(e) => setVolume(parseFloat(e.target.value))}
            />

            {showAnimation ? <Animation isPlaying={isPlaying} /> : null}

            <div className="mt-4">
                
                <input
                    type="range"
                    min="0"  
                    max="2"  
                    step="0.01"
                    value={linearPlaybackRate}
                    onChange={handlePlaybackChange}
                    className="w-full"
                />
                <p className="text-center mt-2">Speed: {playbackRate.toFixed(2)}x</p>
            </div>
        </div>
    );
}
