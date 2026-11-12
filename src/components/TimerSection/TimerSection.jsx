import React from "react";
import styles from "./TimerSection.module.css";

function TimerSection({ lockedInTime, sinceLastGuessTime, children }) {
	const [currTime, setCurrTime] = React.useState(() => performance.now());

	React.useEffect(() => {
		const intervalId = setInterval(() => {
			setCurrTime(performance.now());
		}, 1000);

		return () => clearInterval(intervalId);
	}, [lockedInTime]);

	const timer = getTimer(currTime, lockedInTime);

	const sinceLastGuessTimer =
		sinceLastGuessTime && getTimer(currTime, sinceLastGuessTime);

	return (
		<div className={styles.container}>
			<div>
				<p>Locked in timer:</p>
				<p>{timer}</p>
			</div>
			{sinceLastGuessTime !== null ? (
				<div>
					<p>Since last guess timer:</p>
					<p>{sinceLastGuessTimer}</p>
				</div>
			) : null}
			{children}
		</div>
	);
}

function getTimer(time1, time2) {
	const duration = time1 > time2 ? Math.floor((time1 - time2) / 1000) : 0;
	const minutes = Math.floor(duration / 60);
	const seconds = duration % 60;

	const timer = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;

	return timer;
}

export default TimerSection;
