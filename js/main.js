"use strict";
// -- bind event to reload-button
$('#reload-button').on('click', function(evt) {
	console.log("Calling updateNowPlaying()");
	setlistjunkieapp.updateNowPlaying();
});

// -- refresh when window loads
window.onload = function() {
    setlistjunkieapp.updateNowPlaying();
};
