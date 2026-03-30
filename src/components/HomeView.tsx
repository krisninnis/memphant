type Props = {
  onGoToProjects: () => void;
  onCreateNewProject: () => void;
};

function HomeView({ onGoToProjects, onCreateNewProject }: Props) {
  return (
    <div className="project-panel">
      <h2 className="panel-title">👋 Welcome to Project Brain</h2>

      <p className="meta-item editor-helper-text">
        Keep your project details in one place, then use them across AI tools
        without losing context.
      </p>

      <h3 className="section-title">Start here</h3>
      <ul className="info-list">
        <li>Create a new project from the left sidebar.</li>
        <li>Or open one of your saved projects.</li>
        <li>Copy your project into an AI and continue seamlessly.</li>
      </ul>

      <div className="input-row">
        <button className="button" onClick={onGoToProjects}>
          📂 Go to My Projects
        </button>

        <button className="button export-button" onClick={onCreateNewProject}>
          ➕ Create a New Project
        </button>
      </div>
    </div>
  );
}

export default HomeView;
