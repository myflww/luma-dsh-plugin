import { useEffect, useState } from 'react'
import { OFFICE_SCENE_PREVIEWS } from './office2d/officeScenePreviews.generated.ts'

/** A local first paint; the full-size room and all interaction stay with the real renderer. */
export function OfficeScenePreview({theme,phase,waiting=true}: {theme?:string | undefined;phase:string;waiting?:boolean}) {
  const [slow,setSlow] = useState(false)
  useEffect(()=>{
    if(!waiting){setSlow(false);return}
    const timer=setTimeout(()=>setSlow(true),350)
    return ()=>clearTimeout(timer)
  },[waiting])
  const room=OFFICE_SCENE_PREVIEWS[theme??'classic']??OFFICE_SCENE_PREVIEWS.classic!
  return <div className="lumaOfficeScenePreview" data-office-loading="" style={{backgroundImage:`url("${room[phase]??room.noon}")`}}>
    {waiting && slow && <span role="status">正在加载办公室…</span>}
  </div>
}
