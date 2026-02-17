import { createContext, useContext, useState } from 'react';

const PipContext = createContext();

export const usePip = () => {
  const context = useContext(PipContext);
  if (!context) {
    throw new Error('usePip must be used within PipProvider');
  }
  return context;
};

export const PipProvider = ({ children }) => {
  const [isPipActive, setIsPipActive] = useState(false);
  const [pipVideoUrl, setPipVideoUrl] = useState(null);
  const [pipAnimeInfo, setPipAnimeInfo] = useState(null);
  const [pipStartTime, setPipStartTime] = useState(0);
  const [pipShouldPlay, setPipShouldPlay] = useState(false);

  const activatePip = (videoUrl, animeInfo, options = {}) => {
    setPipVideoUrl(videoUrl);
    setPipAnimeInfo(animeInfo);
    setPipStartTime(options.startTime || 0);
    setPipShouldPlay(!!options.shouldPlay);
    setIsPipActive(true);
  };

  const deactivatePip = () => {
    setIsPipActive(false);
    setPipVideoUrl(null);
    setPipAnimeInfo(null);
    setPipStartTime(0);
    setPipShouldPlay(false);
  };

  return (
    <PipContext.Provider
      value={{
        isPipActive,
        pipVideoUrl,
        pipAnimeInfo,
        pipStartTime,
        pipShouldPlay,
        activatePip,
        deactivatePip,
      }}
    >
      {children}
    </PipContext.Provider>
  );
};
