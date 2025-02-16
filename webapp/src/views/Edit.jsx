import { useEffect, useRef, useState } from "react";
import * as Tone from "tone";
import Player from "../components/Player"

export default function Edit({currentMP3, setCurrentMP3}) {
    const playerRef = useRef(null);
    
    useEffect(() => {
        if (currentMP3) {
            const url = URL.createObjectURL(currentMP3);

            const player = new Tone.Player({url: url, loop:true}).toDestination();
            player.grainSize = 0.2; 
            player.overlap = 0.1; 
            playerRef.current = player;
            

            return () => {
                URL.revokeObjectURL(url); 
            };
        }
    }, [currentMP3]); 
   
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