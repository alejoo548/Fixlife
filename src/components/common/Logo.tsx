import React from 'react';

interface LogoProps {
  onClick?: () => void;
}

export const Logo: React.FC<LogoProps> = ({ onClick }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity bg-transparent border-0 p-0"
    >
      <img 
        src="/Fixilogo.png" 
        alt="Fixlife Logo" 
        className="w-10 h-10 object-contain"
      />
      <span className="font-bold text-xl tracking-tight text-gray-900 hidden sm:block">
        Fix<span className="text-bird-blue">life</span>
      </span>
    </button>
  );
};
