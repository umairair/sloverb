import { useEffect, useRef, useState } from "react";
import animation from "../assets/2.webm";

export default function Animation({ isPlaying }) {
    const animRef = useRef(null);
    const [isLoaded, setIsLoaded] = useState(false);

    useEffect(() => {
        if (animRef.current && isLoaded) {
           
            setTimeout(() => {
                if (isPlaying) {
                    animRef.current.play();
                } else {
                    animRef.current.pause();
                }
            }, 50); 
        }
    }, [isPlaying, isLoaded]);

    return (
        <div>
            <video 
                ref={animRef} 
                src={animation} 
                autoPlay={false} 
                loop 
                muted
                onLoadedData={() => setIsLoaded(true)} 
            />
        </div>
    );
}
