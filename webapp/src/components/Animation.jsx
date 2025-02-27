import { forwardRef, useEffect, useRef, useImperativeHandle, useState } from "react";

const Animation = forwardRef(({ isPlaying }, ref) => {
    const animRef = useRef(null);
    const [isLoaded, setIsLoaded] = useState(false);

    useImperativeHandle(ref, () => ({
        play: () => {
            if (animRef.current && isLoaded) {
                animRef.current.play();
            }
        }
    }));

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
        <div className="w-full h-full">
            <video
                ref={animRef}
                className="w-full h-full object-cover"
                autoPlay={false}
                loop
                muted
                onLoadedData={() => setIsLoaded(true)}
            >
               
                <source src="/space.mp4" type="video/mp4" />
                
            </video>
        </div>
    );
});

export default Animation;