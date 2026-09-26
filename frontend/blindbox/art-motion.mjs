export function artMotion(time, reduced = false, playing = false) {
  if (reduced || !playing || time < 0 || time >= 15) return { lift: 0, heart: null };
  const greeting = time < 2 ? Math.sin(Math.PI * time / 2) : 0;
  const progress = (time - 7.5) / 3.5;
  const heart = progress > 0 && progress < 1 ? {
    progress, opacity: Math.min(1, progress * 6, (1 - progress) * 5),
    scale: .6 + .4 * Math.sin(progress * Math.PI / 2)
  } : null;
  return { lift: greeting * .006, heart };
}
