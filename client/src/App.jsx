import Dashboard from './components/Dashboard.jsx';
import SharedView from './components/SharedView.jsx';

export default function App() {
  const shareToken = new URLSearchParams(window.location.search).get('share');
  return shareToken ? <SharedView token={shareToken} /> : <Dashboard />;
}
