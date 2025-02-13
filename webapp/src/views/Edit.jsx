import Player from "../components/Player"

export default function Edit({currentMP3, setCurrentMP3}) {
   
    return (
        <div className="flex flex-col items-center justify-center">
            {console.log(currentMP3)}
            <button className="bg-red-400" type="button" onClick={() => setCurrentMP3(null)}>{currentMP3.name}</button>

            <Player MP3={currentMP3}/>
        </div>
    )
}

