import { useState, useEffect, useRef } from "react";
import * as Tone from "tone";
import Animation from "../components/Animation";

export default function Player({currentMP3, setCurrentMP3 }) {
    const playerRef = useRef(null);
    const reverbRef = useRef(null);

    const [isPlaying, setIsPlaying] = useState(false);
    const [playbackPosition, setPlaybackPosition] = useState(0);
    const [volume, setVolume] = useState(0);
    const [showAnimation, setShowAnimation] = useState(false);

    const [linearPlaybackRate, setLinearPlaybackRate] = useState(1);
    const [playbackRate, setPlaybackRate] = useState(1);

    const [showReverbSlider, setShowReverbSlider] = useState(false);
    const [reverbLevel, setReverbLevel] = useState(0);
    
    useEffect(() => {
        if (currentMP3) {
            const url = URL.createObjectURL(currentMP3);
            const reverb = new Tone.Reverb({ decay: 4.5, wet: 0 }).toDestination();
            const player = new Tone.Player({url: url, loop:true})

            player.connect(reverb)
            player.grainSize = 0.2; 
            player.overlap = 0.1; 
            playerRef.current = player;
            reverbRef.current = reverb;
            

            return () => {
                URL.revokeObjectURL(url); 
            };
        }
    }, [currentMP3]); 

    async function handleToggle() {
        await Tone.start();

        if (!playerRef.current || !playerRef.current.buffer.loaded) {
            
            return;
        }

        if (!isPlaying) {
            
            if (playerRef.current.state !== "started") {


                playerRef.current.start(0, playbackPosition);
                Tone.Transport.start();
                setShowAnimation(true);
            }
            setIsPlaying(true);
        } else {
            
            setPlaybackPosition(Tone.Transport.seconds);
            if (playerRef.current.state === "started") {
                playerRef.current.stop();
            }
            Tone.Transport.pause();
            setIsPlaying(false);
        }
    }

    function seekForward() {
        if (!playerRef.current) return;
        const newTime = Math.min(playerRef.current.buffer.duration, Tone.Transport.seconds + 10);
        setPlaybackPosition(newTime);
        Tone.Transport.seconds = newTime;
        if (isPlaying) {
            playerRef.current.stop();
            playerRef.current.start(0, newTime);
        }
    }

    function seekBack() {
        if (!playerRef.current) return;
        const newTime = Math.max(0, Tone.Transport.seconds - 10);
        setPlaybackPosition(newTime);
        Tone.Transport.seconds = newTime;
        if (isPlaying) {
            playerRef.current.stop();
            playerRef.current.start(0, newTime);
        }
    }

    useEffect(() => {
        if (playerRef.current) {
            playerRef.current.volume.value = volume;
        }
    }, [volume]);

    useEffect(() => {
        if (playerRef.current) {
            playerRef.current.playbackRate = playbackRate;
        }
    }, [playbackRate]);

    const handlePlaybackChange = (e) => {
        const linearValue = parseFloat(e.target.value);
        const logValue = Math.pow(2, (linearValue - 1));

        setLinearPlaybackRate(linearValue);
        setPlaybackRate(logValue);

        if (logValue < 1.0) {
            setShowReverbSlider(true);
            
        } else {
            reverbRef.current.wet.value = 0;
            setShowReverbSlider(false);
            setReverbLevel(0);
            
           
        }
    };

    const handleReverbChange = (event) => {
        let wet = event.target.value;
     

        if(wet == 0.2) {
            reverbRef.current.wet.value = 0;
            setReverbLevel(0);
            

        }
        else {
            reverbRef.current.wet.value = event.target.value;
            setReverbLevel(event.target.value)
            
        }

    };

    const resetSlider = () => {
        setLinearPlaybackRate(1);
        setPlaybackRate(1);
        reverbRef.current.wet.value = 0;
        setShowReverbSlider(false);
        setReverbLevel(0);
        
    };


    const getMP3DurationWebAudio = (file) => {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          
          reader.readAsArrayBuffer(file);
          reader.onload = () => {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            audioContext.decodeAudioData(reader.result, (buffer) => {
              resolve(buffer.duration);
            }, (err) => reject(err));
          };
      
          reader.onerror = () => reject("Error reading file");
        });
      };



        

      async function handleDownload(event) {
        // get duration of mp3 and calculate new duration after adjusting playback rate

        
            //get duration of mp3
            const duration = await getMP3DurationWebAudio(currentMP3);


            console.log("MP3 Duration:", duration, "seconds");

            //calculate new duration based on playback rate
            const newDuration = duration/playerRef.current.playbackRate;
            console.log(newDuration)

            //use tonejs offline to export the audio with the user selected playback speed, and reverb. 

            const buffer = await Tone.Offline(async () => {
                const url = URL.createObjectURL(currentMP3);
                const reverb = new Tone.Reverb({ decay: 4.5, wet: reverbLevel }).toDestination();
                const player = new Tone.Player().connect(reverb);
    
                await player.load(url); 
    
                player.playbackRate = playbackRate;
                player.grainSize = 0.2;
                player.overlap = 0.1;
    
                player.start(0);
                await Tone.loaded(); 
            }, newDuration);
    
            console.log("Rendered buffer:", buffer);

            const rawAudioData = buffer.getChannelData(0);

            const audioArrayBuffer = rawAudioData.buffer;

            const blob = new Blob([audioArrayBuffer], { type: "application/octet-stream" });

            const formData = new FormData();
            formData.append("audio", blob, "audio.raw");

            try {
                const response = await fetch("http://localhost:6969/upload-audio", {
                    method: "POST",
                    body: formData
                });

                const result = await response.json();
                console.log("Server Response:", result);
            } catch (error) {
                console.error("Error sending audio to server:", error);
            }

          
    }
    

    return (
        <div className="flex flex-col items-center space-y-4 p-6">
            <button className="bg-red-400" type="button" onClick={() => {
                setCurrentMP3(null);
                playerRef.current.disconnect();

                }}>{currentMP3.name
            }</button>

            <button type="button" onClick={handleToggle} className="px-6 py-2 bg-blue-500 text-white rounded-md">
                {isPlaying ? "Pause" : "Play"}
            </button>
            <div className="flex space-x-4">
                <button type="button" onClick={seekBack} className="px-4 py-2 bg-gray-500 text-white rounded-md">-10s</button>
                <button type="button" onClick={seekForward} className="px-4 py-2 bg-gray-500 text-white rounded-md">+10s</button>
            </div>

            <input
                type="range"
                min="-60"
                max="0"
                value={volume}
                onChange={(event) => setVolume(parseFloat(event.target.value))}
                className="w-64"
            />

            {showAnimation ? <Animation isPlaying={isPlaying} /> : null}

            
            <div className="relative w-full max-w-lg mt-6">
                <div className="relative">
                  
                    <div className="absolute inset-0 flex">
                        <div className="w-1/2 bg-blue-500 h-10 rounded-l-lg flex justify-center items-center">
                            <span className="text-white font-semibold text-sm">slow + reverb</span>
                        </div>
                        <div className="w-1/2 bg-pink-500 h-10 rounded-r-lg flex justify-center items-center">
                            <span className="text-white font-semibold text-sm">nightcore</span>
                        </div>
                    </div>

                    
                    <input
                        type="range"
                        min="0"
                        max="2"
                        step="0.01"
                        value={linearPlaybackRate}
                        onChange={handlePlaybackChange}
                        className="relative w-full appearance-none h-10 bg-transparent cursor-pointer"
                        style={{
                            WebkitAppearance: "none",
                            appearance: "none",
                            zIndex: 10,
                        }}
                    />
                </div>
            </div>

            {showReverbSlider && (
                <div className="mt-4 w-64">
                    <label className="block text-sm font-medium text-center">Reverb</label>
                    <input
                        type="range"
                        min="0.2"
                        max="0.8"
                        step="0.01"
                        value={reverbLevel}
                        onChange={handleReverbChange}
                        className="w-full"
                    />
                   
                </div>
            )}

           
            <button
                type="button"
                onClick={resetSlider}
                className="px-6 py-2 bg-red-500 text-white rounded-md"
            >
                Reset
            </button>



            <button onClick={handleDownload} className="bg-green-500 p-2 text-white rounded-md">Download</button>
        </div>
    );
}
