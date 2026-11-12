import { useEffect, useState } from 'react';

export function useBlobUrl(blob?: Blob | null): string | undefined {
  const [state, setState] = useState<{ blob: Blob; url: string }>();
  useEffect(() => {
    if (!blob) {
      setState(undefined);
      return;
    }
    const url = URL.createObjectURL(blob);
    setState({ blob, url });
    return () => URL.revokeObjectURL(url);
  }, [blob]);
  return state && state.blob === blob ? state.url : undefined;
}
