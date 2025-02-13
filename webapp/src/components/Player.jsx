import { useEffect, useRef, useState } from "react";
import * as Tone from "tone";

export default function Player({playerRef}) {
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0); // Track position



    async function handleToggle() {
        await Tone.start();

        if (!isPlaying) {
            playerRef.current.start(undefined, currentTime); // Resume from last position
            setIsPlaying(true);
        } else {
            setCurrentTime(playerRef.current.toSeconds()); // Save current position
            playerRef.current.stop();
            setIsPlaying(false);
        }
    }

    function seekForward() {

    }

    function seekBack() {
        
    }

    return (
        <div className="flex flex-col">
            <button type="button" onClick={handleToggle}>
                {isPlaying ? "Pause" : "Play"}
            </button>
            <button type="button" onClick={seekForward}>skip 10s forward</button>
            <button type="button" onClick={seekBack}>go 10s back</button>
        </div>
    );
}
