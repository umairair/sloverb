import { useState, useEffect } from "react";
import * as Tone from "tone";
import Animation from "./Animation";

export default function Player({ playerRef }) {
    const [isPlaying, setIsPlaying] = useState(false);
    const [playbackPosition, setPlaybackPosition] = useState(0);
    const [volume, setVolume] = useState(0);
    const [detune, setDetune] = useState(0); 

    const [showAnimation, setShowAnimation] = useState(false);

    async function handleToggle() {
        await Tone.start();
    
        if (!isPlaying) {
            if (Tone.Transport.state !== "started") {
                Tone.Transport.start();
                playerRef.current.start(0, playbackPosition);
    
              
                //playerRef.current.detune = -900;
    
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

    // effect to handle volume changes
    useEffect(() => {
        if (playerRef.current) {
            playerRef.current.volume.value = volume;
        }
    }, [volume]);

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
            {showAnimation? <Animation isPlaying={isPlaying}/>: null}
            <button onClick={() => playerRef.current.detune = playerRef.current.detune + 100} className="bg-green-500">+ 100 cents</button>
            <button onClick={() => playerRef.current.detune = playerRef.current.detune - 100} className="bg-red-400">- 100 cents</button>
            <button onClick={() => playerRef.current.detune =0} className="bg-slate-500">reset pitch</button>

        </div>
    );
}
