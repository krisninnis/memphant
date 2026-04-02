/**
 * WelcomeScreen — shown when there are no projects yet.
 */
import { createProject, createProjectFromFolder } from '../../services/tauriActions';
import './WelcomeScreen.css';

export function WelcomeScreen() {
  return (
    <div className="welcome-screen">
      <div className="welcome-card">
        <div className="welcome-logo">🧠</div>
        <h1 className="welcome-title">Project Brain</h1>
        <p className="welcome-tagline">
          Remember your projects so your AIs don't have to.
        </p>

        <div className="welcome-actions">
          <button
            className="welcome-btn welcome-btn--primary"
            onClick={() => void createProject('My First Project')}
          >
            <span>🆕</span>
            Create Your First Project
          </button>
          <button
            className="welcome-btn welcome-btn--secondary"
            onClick={() => void createProjectFromFolder()}
          >
            <span>📂</span>
            Scan a Project Folder
          </button>
        </div>

        <p className="welcome-description">
          Switch between ChatGPT, Claude, Grok, Perplexity and Gemini — without starting over.
        </p>

        <p className="welcome-privacy">🔒 Your data stays on this device.</p>
      </div>
    </div>
  );
}

export default WelcomeScreen;
