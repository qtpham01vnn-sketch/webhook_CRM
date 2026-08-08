import Dashboard from './components/Dashboard.jsx';
import SharedView from './components/SharedView.jsx';

export default function App() {
  const hashMatch = window.location.hash.match(/^#\/share\/([^/?#]+)/i);
  const shareToken = hashMatch?.[1] || new URLSearchParams(window.location.search).get('share');
  return shareToken ? <SharedView token={shareToken} /> : <Dashboard />;
}
