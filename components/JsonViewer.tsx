
import React, { useState, useEffect } from 'react';

interface JsonViewerProps {
  data: object | null;
  editable?: boolean;
  onDataChange?: (newData: any) => void;
}

const JsonViewer: React.FC<JsonViewerProps> = ({ data, editable = false, onDataChange }) => {
  const [jsonString, setJsonString] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (data) {
      setJsonString(JSON.stringify(data, null, 2));
    }
  }, [data]);

  if (!data) return null;

  const handleJsonChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setJsonString(e.target.value);
    setError(null);
  };

  const handleSave = () => {
    try {
      const parsedData = JSON.parse(jsonString);
      setError(null);
      setIsEditing(false);
      if (onDataChange) {
        onDataChange(parsedData);
      }
    } catch (err) {
      setError('Invalid JSON format. Please fix the syntax errors.');
    }
  };

  const handleCancel = () => {
    setJsonString(JSON.stringify(data, null, 2));
    setError(null);
    setIsEditing(false);
  };

  return (
    <div className="bg-gray-900/70 p-4 rounded-lg border border-gray-700">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-bold text-cyan-400">Raw JSON {editable && '(Editable)'}</h3>
        {editable && !isEditing && (
          <button
            onClick={() => setIsEditing(true)}
            className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded text-sm transition-colors"
          >
            Edit JSON
          </button>
        )}
        {isEditing && (
          <div className="space-x-2">
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded text-sm transition-colors"
            >
              Save Changes
            </button>
            <button
              onClick={handleCancel}
              className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded text-sm transition-colors"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
      {error && (
        <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded text-red-300 text-sm">
          {error}
        </div>
      )}
      {isEditing ? (
        <textarea
          value={jsonString}
          onChange={handleJsonChange}
          className="w-full h-96 text-sm font-mono text-gray-300 bg-gray-800 p-4 rounded-md border border-gray-600 focus:border-cyan-500 focus:outline-none resize-none"
          spellCheck={false}
        />
      ) : (
        <pre className="text-sm text-left text-gray-300 bg-gray-800 p-4 rounded-md overflow-x-auto max-h-96">
          <code>{jsonString}</code>
        </pre>
      )}
    </div>
  );
};

export default JsonViewer;
