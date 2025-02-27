import { useEffect, useRef, useState } from "react";

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
                loop 
                muted
                playsInline
                preload="auto"
                onLoadedData={() => setIsLoaded(true)}
                style={{ width: "100%", maxWidth: "600px", height: "auto", display: "block", background: "black" }} // ✅ Force visibility
            >
                <source src="/space.mp4" type="video/mp4" />
                <source src="/space.webm" type="video/webm" />
                Your browser does not support the video tag.
            </video>


        </div>
    );
}
