import React, { useEffect, useRef, useState } from "react";
import * as Tone from "tone";

const formatTime = (seconds) => {
  if (isNaN(seconds) || seconds < 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
};

const AudioPlayer = ({ file }) => {
  const [player, setPlayer] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(1);
  const [isSeeking, setIsSeeking] = useState(false); // To prevent UI desync when seeking
  const intervalRef = useRef(null);

  useEffect(() => {
    if (!file) return;

    const url = URL.createObjectURL(file);
    const newPlayer = new Tone.Player(url, () => {
      setDuration(newPlayer.buffer.duration);
    }).toDestination();
    newPlayer.loop = true; // Loop when finished

    setPlayer(newPlayer);

    return () => {
      newPlayer.dispose();
      URL.revokeObjectURL(url);
    };
  }, [file]);

  useEffect(() => {
    if (isPlaying && player) {
      intervalRef.current = setInterval(() => {
        if (!isSeeking) {
          setProgress(player.toSeconds(player.position));
        }
      }, 500);
    } else {
      clearInterval(intervalRef.current);
    }

    return () => clearInterval(intervalRef.current);
  }, [isPlaying, player, isSeeking]);

  const togglePlay = async () => {
    if (!player) return;

    if (isPlaying) {
      player.stop();
      setIsPlaying(false);
      setProgress(0); // Reset progress on stop
    } else {
      await Tone.start();
      player.start();
      setIsPlaying(true);
    }
  };

  const startSeek = () => {
    setIsSeeking(true);
  };

  const seekAudio = (e) => {
    if (!player) return;

    const value = parseFloat(e.target.value);
    setProgress(value); // Update UI immediately
    player.seek(value);
  };

  const endSeek = () => {
    setIsSeeking(false);
  };

  return (
    <div className="w-full max-w-md p-4 bg-gray-800 text-white rounded-lg shadow-md">
      <div className="flex items-center gap-4">
        {/* Play/Pause Button */}
        <button
          onClick={togglePlay}
          className="p-2 bg-gray-700 rounded-md hover:bg-gray-600 transition"
        >
          {isPlaying ? "⏸️" : "▶️"}
        </button>

        {/* Progress Bar */}
        <input
          type="range"
          min="0"
          max={duration}
          step="0.1"
          value={progress}
          onMouseDown={startSeek} // Prevents UI desync when seeking
          onChange={seekAudio} // Updates progress immediately
          onMouseUp={endSeek} // Resumes normal tracking
          className="w-full appearance-none bg-gray-700 cursor-pointer"
          style={{
            accentColor: "#3b82f6",
          }}
        />
      </div>

      {/* Time Display */}
      <div className="flex justify-between text-sm mt-2">
        <span>{formatTime(progress)}</span>
        <span>{formatTime(duration)}</span>
      </div>
    </div>
  );
};

export default AudioPlayer;
