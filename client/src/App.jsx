import Dashboard from './components/Dashboard.jsx';
import EmbedView from './components/EmbedView.jsx';
import SharedView from './components/SharedView.jsx';

export default function App() {
  const hashMatch = window.location.hash.match(/^#\/share\/([^/?#]+)/i);
  const embedMatch = window.location.hash.match(/^#\/embed\/([^/?#]+)/i);
  const shareToken = hashMatch?.[1] || new URLSearchParams(window.location.search).get('share');
  if (embedMatch?.[1]) return <EmbedView slug={decodeURIComponent(embedMatch[1])} />;
  return shareToken ? <SharedView token={shareToken} /> : <Dashboard />;
}
