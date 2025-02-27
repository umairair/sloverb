import { useEffect, useRef, useState } from "react";
import animation from "../assets/space.mp4";

export default function Animation({ isPlaying }) {
    const animRef = useRef(null);
    const [isLoaded, setIsLoaded] = useState(false);

    useEffect(() => {
        if (animRef.current && isLoaded) {
            if (isPlaying) {
                animRef.current.play();
            } else {
                animRef.current.pause();
            }
        }
    }, [isPlaying, isLoaded]);

    return (
        <div>
            <video 
                ref={animRef} 
                src={animation} 
                loop 
                muted
                onLoadedData={() => {
                    setIsLoaded(true);
                    if (isPlaying) {
                        animRef.current.play();
                    }
                }} 
            />
        </div>
    );
}
