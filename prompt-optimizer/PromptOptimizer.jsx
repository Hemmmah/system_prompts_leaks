import React, { useState } from 'react';
import { Copy, Sparkles, CheckCircle, AlertCircle, Zap } from 'lucide-react';

const PromptOptimizer = () => {
  const [originalPrompt, setOriginalPrompt] = useState('');
  const [feedbackText, setFeedbackText] = useState('');
  const [criticType, setCriticType] = useState('consistency');
  const [selectedModel, setSelectedModel] = useState('claude-sonnet-4-20250514');
  const [optimizedPrompt, setOptimizedPrompt] = useState('');
  const [changeSummary, setChangeSummary] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [copied, setCopied] = useState(false);

  const modelOptions = [
    {
      value: 'claude-sonnet-4-20250514',
      label: 'Claude Sonnet 4',
      description: 'Smart, efficient model for everyday optimization tasks',
      badge: 'Recommended'
    },
    {
      value: 'claude-opus-4',
      label: 'Claude Opus 4',
      description: 'Most capable model for complex prompt engineering',
      badge: 'Premium'
    }
  ];

  const criticOptions = [
    {
      value: 'consistency',
      label: 'Internal Consistency Check',
      description: 'Verify logical flow and eliminate contradictions',
      icon: <CheckCircle className="w-4 h-4" />
    },
    {
      value: 'feedback',
      label: 'Feedback-Based Revision',
      description: 'Improve prompt based on specific feedback',
      icon: <AlertCircle className="w-4 h-4" />
    },
    {
      value: 'clarity',
      label: 'Clarity Enhancement',
      description: 'Improve readability and remove ambiguity',
      icon: <Sparkles className="w-4 h-4" />
    },
    {
      value: 'effectiveness',
      label: 'Effectiveness Optimization',
      description: 'Maximize classification accuracy and performance',
      icon: <Zap className="w-4 h-4" />
    }
  ];

  const handleOptimize = async () => {
    if (!originalPrompt.trim()) return;

    setIsLoading(true);
    try {
      const selectedCritic = criticOptions.find(opt => opt.value === criticType);

      let prompt = `You are an expert prompt engineer specializing in text classification tasks. Your goal is to improve the following structured prompt while preserving its EXACT original structure, formatting, line breaks, indentation, and layout.

Original Prompt:
"""
${originalPrompt}
"""

Optimization Type: ${selectedCritic.label}
Focus: ${selectedCritic.description}`;

      if (criticType === 'feedback' && feedbackText.trim()) {
        prompt += `

Specific Feedback to Address:
"""
${feedbackText}
"""`;
      }

      prompt += `

Please provide your response in the following JSON format. Be very careful with JSON escaping - use \\n for line breaks and escape quotes properly:

{
  "optimized_prompt": "The improved version of the prompt with exact formatting preserved",
  "change_summary": "A detailed summary of the changes made and reasoning"
}

CRITICAL REQUIREMENTS for the optimized prompt:
1. PRESERVE EXACTLY: All line breaks, spacing, indentation, bullet points, numbering, and formatting from the original
2. MAINTAIN STRUCTURE: Keep the same sections, headers, and organizational elements
3. IMPROVE CONTENT: ${criticType === 'consistency' ? 'Ensure internal consistency and logical flow' :
         criticType === 'feedback' ? 'Address the provided feedback while preserving effectiveness' :
         criticType === 'clarity' ? 'Improve clarity and remove ambiguity' :
         'Maximize classification effectiveness and accuracy'}
4. PRESERVE EXAMPLES: Keep all examples, templates, or sample formats intact
5. ENHANCE CLARITY: Use more precise language while keeping the exact same structure

Requirements for the change summary:
1. List specific textual changes made (word choices, phrasing improvements)
2. Explain the reasoning behind each significant modification
3. Describe how these changes improve prompt effectiveness for text classification
4. Note any terminology or instruction improvements
5. Keep explanations clear and actionable

IMPORTANT:
- Your response must be ONLY a valid JSON object
- Properly escape all quotes and newlines in the JSON strings
- Do NOT include markdown formatting, code blocks, or any text outside the JSON
- Preserve the original's formatting exactly in the optimized_prompt field`;

      const response = await window.claude.complete(prompt);

      try {
        // Clean the response to ensure it's valid JSON
        let cleanedResponse = response.trim();

        // Remove any potential markdown code blocks
        if (cleanedResponse.startsWith('```json')) {
          cleanedResponse = cleanedResponse.replace(/^```json\s*/, '').replace(/```\s*$/, '');
        } else if (cleanedResponse.startsWith('```')) {
          cleanedResponse = cleanedResponse.replace(/^```\s*/, '').replace(/```\s*$/, '');
        }

        const parsedResponse = JSON.parse(cleanedResponse);

        if (parsedResponse.optimized_prompt && parsedResponse.change_summary) {
          setOptimizedPrompt(parsedResponse.optimized_prompt);
          setChangeSummary(parsedResponse.change_summary);
        } else {
          throw new Error('Missing required fields in response');
        }
      } catch (parseError) {
        console.error('Error parsing JSON response:', parseError);
        console.error('Raw response:', response);

        // Fallback: try to extract content manually if JSON parsing fails
        try {
          // Look for content between quotes after "optimized_prompt":
          const promptMatch = response.match(/"optimized_prompt":\s*"((?:[^"\\]|\\.)*)"/);
          const summaryMatch = response.match(/"change_summary":\s*"((?:[^"\\]|\\.)*)"/);

          if (promptMatch && summaryMatch) {
            // Unescape the strings
            const unescapeString = (str) => str.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
            setOptimizedPrompt(unescapeString(promptMatch[1]));
            setChangeSummary(unescapeString(summaryMatch[1]));
          } else {
            setOptimizedPrompt('Error: Could not parse the optimized prompt from response.');
            setChangeSummary('Error: Could not parse the change summary from response.');
          }
        } catch (fallbackError) {
          console.error('Fallback parsing failed:', fallbackError);
          setOptimizedPrompt('Error: Failed to parse response. Please try again.');
          setChangeSummary('Error: Failed to parse change analysis. Please try again.');
        }
      }
    } catch (error) {
      console.error('Error optimizing prompt:', error);
      setOptimizedPrompt('Error: Failed to optimize prompt. Please try again.');
      setChangeSummary('Error occurred during optimization.');
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(optimizedPrompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl flex items-center justify-center shadow-lg">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-slate-800 to-blue-800 bg-clip-text text-transparent">
              Prompt Optimization Studio
            </h1>
          </div>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed">
            Transform your text classification prompts into precision instruments with AI-powered optimization
          </p>
        </div>

        <div className="grid xl:grid-cols-2 gap-8">
          {/* Input Section */}
          <div className="space-y-6">
            <div className="bg-white/70 backdrop-blur-sm rounded-3xl p-8 shadow-xl border border-white/20">
              <h2 className="text-2xl font-semibold text-slate-800 mb-6 flex items-center gap-3">
                <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                  <span className="text-blue-600 font-bold text-sm">1</span>
                </div>
                Original Prompt
              </h2>

              <textarea
                value={originalPrompt}
                onChange={(e) => setOriginalPrompt(e.target.value)}
                placeholder="Enter your text classification prompt here..."
                className="w-full h-48 p-4 rounded-2xl border border-slate-200 focus:border-blue-400 focus:ring-4 focus:ring-blue-100 transition-all duration-300 resize-none bg-white/80 text-slate-700 placeholder-slate-400"
              />
            </div>

            <div className="bg-white/70 backdrop-blur-sm rounded-3xl p-8 shadow-xl border border-white/20">
              <h2 className="text-2xl font-semibold text-slate-800 mb-6 flex items-center gap-3">
                <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                  <span className="text-blue-600 font-bold text-sm">2</span>
                </div>
                Claude Model
              </h2>

              <div className="grid gap-3">
                {modelOptions.map((model) => (
                  <label
                    key={model.value}
                    className={`flex items-start gap-4 p-4 rounded-2xl border cursor-pointer transition-all duration-300 ${
                      selectedModel === model.value
                        ? 'border-blue-400 bg-blue-50 shadow-lg'
                        : 'border-slate-200 bg-white/60 hover:border-blue-300 hover:bg-blue-25'
                    }`}
                  >
                    <input
                      type="radio"
                      name="selectedModel"
                      value={model.value}
                      checked={selectedModel === model.value}
                      onChange={(e) => setSelectedModel(e.target.value)}
                      className="mt-1 text-blue-600 focus:ring-blue-500"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-slate-800">{model.label}</span>
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                          model.badge === 'Recommended'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-purple-100 text-purple-700'
                        }`}>
                          {model.badge}
                        </span>
                      </div>
                      <p className="text-sm text-slate-600">{model.description}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div className="bg-white/70 backdrop-blur-sm rounded-3xl p-8 shadow-xl border border-white/20">
              <h2 className="text-2xl font-semibold text-slate-800 mb-6 flex items-center gap-3">
                <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                  <span className="text-blue-600 font-bold text-sm">3</span>
                </div>
                Optimization Type
              </h2>

              <div className="grid gap-3">
                {criticOptions.map((option) => (
                  <label
                    key={option.value}
                    className={`flex items-start gap-4 p-4 rounded-2xl border cursor-pointer transition-all duration-300 ${
                      criticType === option.value
                        ? 'border-blue-400 bg-blue-50 shadow-lg'
                        : 'border-slate-200 bg-white/60 hover:border-blue-300 hover:bg-blue-25'
                    }`}
                  >
                    <input
                      type="radio"
                      name="criticType"
                      value={option.value}
                      checked={criticType === option.value}
                      onChange={(e) => setCriticType(e.target.value)}
                      className="mt-1 text-blue-600 focus:ring-blue-500"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        {option.icon}
                        <span className="font-semibold text-slate-800">{option.label}</span>
                      </div>
                      <p className="text-sm text-slate-600">{option.description}</p>
                    </div>
                  </label>
                ))}
              </div>

              {criticType === 'feedback' && (
                <div className="mt-6">
                  <button
                    onClick={() => setShowFeedback(!showFeedback)}
                    className="flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium mb-3 transition-colors"
                  >
                    <AlertCircle className="w-4 h-4" />
                    {showFeedback ? 'Hide' : 'Add'} Feedback Details
                  </button>

                  {showFeedback && (
                    <textarea
                      value={feedbackText}
                      onChange={(e) => setFeedbackText(e.target.value)}
                      placeholder="Describe the specific feedback or issues you want addressed..."
                      className="w-full h-32 p-4 rounded-2xl border border-slate-200 focus:border-blue-400 focus:ring-4 focus:ring-blue-100 transition-all duration-300 resize-none bg-white/80 text-slate-700 placeholder-slate-400"
                    />
                  )}
                </div>
              )}
            </div>

            <button
              onClick={handleOptimize}
              disabled={!originalPrompt.trim() || isLoading}
              className="w-full bg-gradient-to-r from-blue-600 to-indigo-700 text-white font-semibold py-4 px-8 rounded-2xl shadow-lg hover:shadow-xl transform hover:scale-[1.02] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center gap-3"
            >
              {isLoading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  Optimizing...
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5" />
                  Optimize Prompt
                </>
              )}
            </button>
          </div>

          {/* Output Section */}
          <div className="space-y-6">
            <div className="bg-white/70 backdrop-blur-sm rounded-3xl p-8 shadow-xl border border-white/20">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-semibold text-slate-800 flex items-center gap-3">
                  <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                    <span className="text-green-600 font-bold text-sm">4</span>
                  </div>
                  Optimized Prompt
                </h2>

                {optimizedPrompt && (
                  <button
                    onClick={copyToClipboard}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all duration-300 ${
                      copied
                        ? 'bg-green-100 text-green-700 border border-green-200'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'
                    }`}
                    title="Copy optimized prompt to clipboard"
                  >
                    <Copy className="w-4 h-4" />
                    {copied ? 'Copied!' : 'Copy Prompt'}
                  </button>
                )}
              </div>

              <div className="relative">
                <div
                  className={`w-full h-80 p-4 rounded-2xl border bg-white/80 transition-all duration-300 overflow-y-auto ${
                    optimizedPrompt
                      ? 'border-green-200 bg-green-50/50'
                      : 'border-slate-200'
                  }`}
                >
                  {optimizedPrompt ? (
                    <div className="prose prose-slate max-w-none">
                      <pre className="whitespace-pre-wrap text-slate-700 font-mono text-sm leading-relaxed">
                        {optimizedPrompt}
                      </pre>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-full text-slate-400">
                      <div className="text-center">
                        <Sparkles className="w-12 h-12 mx-auto mb-4 opacity-50" />
                        <p className="text-lg">Your optimized prompt will appear here</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="bg-white/70 backdrop-blur-sm rounded-3xl p-8 shadow-xl border border-white/20">
              <h2 className="text-2xl font-semibold text-slate-800 mb-6 flex items-center gap-3">
                <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center">
                  <span className="text-amber-600 font-bold text-sm">5</span>
                </div>
                Change Analysis
              </h2>

              <div className="relative">
                <div
                  className={`w-full h-64 p-4 rounded-2xl border bg-white/80 transition-all duration-300 overflow-y-auto ${
                    changeSummary
                      ? 'border-amber-200 bg-amber-50/50'
                      : 'border-slate-200'
                  }`}
                >
                  {changeSummary ? (
                    <div className="prose prose-slate max-w-none">
                      <div className="text-slate-700 text-sm leading-relaxed">
                        {changeSummary}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-full text-slate-400">
                      <div className="text-center">
                        <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
                        <p className="text-lg">Change analysis will appear here</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-12 text-slate-500">
          <p>Powered by Claude AI • Built for prompt engineering excellence</p>
        </div>
      </div>
    </div>
  );
};

export default PromptOptimizer;
