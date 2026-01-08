import './FloatingAction.scss'

const FloatingAction = ({ onClick }) => {
  return (
    <button className="floating-action" onClick={onClick} aria-label="Добавить новую задачу">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <line x1="12" y1="5" x2="12" y2="19" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
        <line x1="5" y1="12" x2="19" y2="12" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
      </svg>
    </button>
  )
}

export default FloatingAction
