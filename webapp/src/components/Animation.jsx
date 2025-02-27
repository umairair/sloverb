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
                playsInline // ✅ Required for iOS
                preload="auto" // ✅ Helps load video faster
                onLoadedData={() => setIsLoaded(true)}
            >
                
                <source src="/space.mp4" type="video/mp4" />
                
            </video>

        </div>
    );
}
