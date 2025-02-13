import { useEffect, useRef, useState } from "react";
import * as Tone from "tone";
import Player from "../components/Player"

export default function Edit({currentMP3, setCurrentMP3}) {
    const playerRef = useRef(null);
    

    useEffect(() => {
        if (currentMP3) {
            const url = URL.createObjectURL(currentMP3); // Convert file to Blob URL

            const player = new Tone.Player(url).toDestination();
            playerRef.current = player;

            return () => {
                URL.revokeObjectURL(url); // Clean up Blob URL when component unmounts
            };
        }
    }, [currentMP3]); // Re-run when MP3 file changes

   

    return (
        <div className="flex flex-col items-center justify-center">
            {console.log(currentMP3)}
            <button className="bg-red-400" type="button" onClick={() => {
                setCurrentMP3(null);
                playerRef.current.disconnect();

                }}>{currentMP3.name}</button>

            <Player playerRef={playerRef}/>
        </div>
    )
}

