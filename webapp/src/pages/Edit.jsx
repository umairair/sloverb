export default function Player({currentMP3, setCurrentMP3}) {
   
    return (
        <>
            {console.log(currentMP3)}
            <button className="bg-red-400" type="button" onClick={() => setCurrentMP3(null)}>{currentMP3.name}</button>

        </>
    )
}