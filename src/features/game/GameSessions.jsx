'use client';

import { createContext, useContext, useState } from 'react';

const Context = createContext(null);

// In-memory public state survives App Router navigation. Reloading starts fresh,
// matching the existing game. No answers for unplayed questions are stored here.
export function GameSessions({ children }) {
  const [sessions] = useState(() => new Map());
  return <Context.Provider value={sessions}>{children}</Context.Provider>;
}

export function useGameSessions() { return useContext(Context); }
