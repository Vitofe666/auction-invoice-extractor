
import React from 'react';
import { LayersIcon } from './icons';

const Header: React.FC = () => {
  return (
    <header className="bg-gray-800 shadow-md">
      <div className="container mx-auto px-4 md:px-8 py-4 flex items-center">
        <LayersIcon className="h-8 w-8 text-cyan-400" />
        <h1 className="ml-3 text-2xl font-bold tracking-tight text-white">
          Auction Invoice Extractor
        </h1>
      </div>
    </header>
  );
};

export default Header;
