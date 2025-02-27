import { useEffect, useRef, useState } from "react";

export default function Animation({ isPlaying }) {
    const animRef = useRef(null);
    const [isLoaded, setIsLoaded] = useState(false);

    useEffect(() => {
        if (animRef.current && isLoaded) {
            setTimeout(() => {
                if (isPlaying) {
                    animRef.current.play().catch(err => console.log("Play error:", err));
                } else {
                    animRef.current.pause();
                }
            }, 50);
        }
    }, [isPlaying, isLoaded]);

    return (
        <div style={{ width: "100%", maxWidth: "600px", height: "auto", overflow: "hidden", display: "flex", justifyContent: "center", alignItems: "center", background: "black" }}>
            <video 
                ref={animRef} 
                loop 
                muted
                playsInline
                preload="auto"
                style={{ width: "100%", height: "auto", display: "block", background: "black" }}
                onLoadedData={() => setIsLoaded(true)}
            >
                <source src="/space.mp4" type="video/mp4" />
               
                
            </video>
        </div>
    );
}
