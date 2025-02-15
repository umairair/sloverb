import { useState, useEffect } from "react";
import * as Tone from "tone";

export default function Player({ playerRef }) {
    const [isPlaying, setIsPlaying] = useState(false);
    const [playbackPosition, setPlaybackPosition] = useState(0);
    const [volume, setVolume] = useState(0);

    async function handleToggle() {
        await Tone.start();

        if (!isPlaying) {
           
            if (Tone.Transport.state !== "started") {
                Tone.Transport.start(); 
                playerRef.current.start(0, playbackPosition);
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
        </div>
    );
}
