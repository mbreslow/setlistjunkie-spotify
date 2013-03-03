"use strict";
(function( setlistjunkieapp, $, undefined ) {
    var sp = getSpotifyApi();
    var models = sp.require('$api/models');
    var views = sp.require('$api/views');
    
    var nextid = 0;
    
    setlistjunkieapp.updateNowPlaying = function() {
    	var player = models.player;

        // Get the track that is currently playing
        var currentTrack = player.track;
        if (currentTrack == null || typeof currentTrack.artists === 'undefined') {
        	return;
        }
        var artistName = currentTrack.artists[0].name;

        var currentHTML = document.getElementById('nowplaying');
        // if nothing currently playing
        if (currentTrack == null) {
            currentHTML.innerHTML = 'No track currently playing';
        } else {
            currentHTML.innerHTML = 'Now playing: ' + currentTrack;
        }
        $('#setlists').empty();
        var uri = 'http://api.setlist.fm/rest/0.1/search/setlists.json?artistName='+artistName;
        $.getJSON(uri, function(data) {
        	$.each(data.setlists.setlist, function(i, item) {
        		if (item.sets && item.sets.set) {
        			console.log("typeof item.sets.set: " + typeof item.sets.set);
        			if (typeof item.sets.set === 'Array') {
	        			$.each(item.sets.set, function(i, set) {
	        				handleSet(artistName,item,set);	
	        			});
					}
					else {
						handleSet(artistName,item,item.sets.set);
					}        			
        		}
        		
        		if (i > 5) return false;
        	})
        });
    }
    
    function handleSet(artistName,item, set) {
    	console.log(set);
		var playlistId = "playlist"+nextid++;
		var setlistSection =
		"<h2>"+
		"<span class='date'>"+parseSetlistFMDate(item['@eventDate'])+"</span>"+
		" <span class='venue'>"+item.venue['@name']+"</span>"+
		" <span class='city'>"+item.venue.city['@name']+", "+item.venue.city['@stateCode']+"</span>"+
		" <span class='country'>"+item.venue.city.country['@name']+"</span>"+
		"</h2>";
		if (typeof set['@name'] !== 'undefined'){
			setlistSection += "<h3><span class='set'>"+set['@name']+"</h3>";
		}
		setlistSection += "<div id='"+playlistId+"'></div>";
		$("#setlists").append(setlistSection);
		
		// -- create a spotify playlist for the songlist and render it
		appendPlaylist(playlistId, artistName, set.song, item.url); 
    }
    
    /**
     * Iterates over the Array of song objects in songsArray
     * and creates a Playlist for them
     * @
     */
    function appendPlaylist(playlistDivId, artist, songsArray, externalUrl) {
    	console.log("Appending playlist %s for %s", playlistDivId, artist);
    	console.log(songsArray);
    	if (!songsArray || songsArray.length == 0) {
    		return;
    	}
    	var setlistPlaylist = new models.Playlist();
    	var fullSetlistListItems = "";
    	
    	// -- create a pipeline of functions to call so we can sequentially
    	//    search for and add the Tracks to a playlist
    	var pipeline = new Array();
    	$.each(songsArray, function(i, item) { 	 
    		var songname = item['@name'];  		
    		pipeline.push(function() {
    			findTrack(artist, songname, function(srchArtist, srchSong, track, searchQuery) {
    				var fullInfo = "<li>"+srchSong;
    				if (track != null) {
    					console.log("Adding to playlist " + track.toString());
    					setlistPlaylist.add(track);
    				}
    				else {
    					fullInfo += " (not found in Spotify - query " + searchQuery + ")";    					
    				}
    				fullInfo += "</li>";
    				fullSetlistListItems += fullInfo;
    				if (pipeline.length>0) {
    					var next = pipeline.shift();
    					next();
    				}
    				else {
    					console.log("Calling add playlist to view");
    					// pipeline is empty so playlist is complete.  Add it to view
    					addPlaylistToView(playlistDivId, setlistPlaylist, fullSetlistListItems, externalUrl);
    				}
    			});
    		});    		
    	});
    	// -- call the first function in the pipeline
    	var first = pipeline.shift();
    	first();
    } 
    
    /**
     * Add the given models.Playlist() to the Dom underneath the 
     * element identified by playlistDivId
     * @param {string} playlistDivId - DIV ID to attach Playlist to
     * @param {models.Playlist} playlist - playlist to add to DOM
     * @param {string} setlistDOMListItems - String of <li> list items with all setlist names
     * @param {string} externalUrl - Link to source information on setlist.fm
     */
    function addPlaylistToView(playlistDivId, playlist, setlistDOMListItems, externalUrl) {
    	var playlistView = new views.List(playlist);
    	playlistView.track = null; // Don't play the track right away
    	playlistView.context = playlist;
    	console.log("Adding playlistView to " + $("#"+playlistDivId));
    	var setlistWikiDivId = playlistDivId+"setlistwiki";
    	var fullSetlistOL = 
    	"<div class='setlistwikidata'>Details from <a href='"+externalUrl+"'>setlist.fm</a>"+
    	"<ol>" + 
    		setlistDOMListItems + 
    	"</ol></div>";
    	$("#"+playlistDivId).append(playlistView.node).append(fullSetlistOL);
    }
    
    /**
     * Search for a Track in spotify and add it to the trackmap if found
	 * @param {string} artist   - artist to search for
	 * @param {string} song     - song to search for
	 * @param {function} callback - function to call with artist, song, [result Track]
     */
    function findTrack(artist,song,callback) {	
    	var searchQuery = "artist:"+artist+" track:"+song;
    	console.log("Searching for track with query [" + searchQuery+"]");	
		var search = new models.Search(searchQuery);
		search.localResults = models.LOCALSEARCHRESULTS.APPEND;
		search.searchAlbums = false;
		search.searchArtists = false;
		search.searchPlaylists = false;
		search.pageSize = 1;
				
		search.observe(models.EVENT.CHANGE, function(a,b,c) {
			if (search.tracks.length > 0) {
				callback(artist, song, search.tracks[0], searchQuery);
			}
			else {
				callback(artist, song, null, searchQuery);
			}
		});
		
		search.appendNext();
    }
  
    /**
     * Converts date in format dd-MM-yyyy to JavaScript Date()
     * @param {String} dateString - input Date
     * @return {String} Date parsed
     */
  	function parseSetlistFMDate(dateString) {
  		var regexExp = /^([0-9]?[0-9])-([0-9]?[0-9])-([12][0-9]{3})$/g;
  		var match = regexExp.exec(dateString);
  		if (match && match.length == 4) {  			
  			var result = new Date(match[3],match[2],match[1]).toDateString();
  			return result;
  		}
  		else {
  			return "";
  		}
  		
  	}
    
    /**
     * Test to see if the given String ends with the given suffix
	 * @param {Object} str - string to test
	 * @param {Object} suffix - test if 'str' ends with this
     */
    function endsWith(str, suffix) {
	    return str.indexOf(suffix, str.length - suffix.length) !== -1;
	}
}( window.setlistjunkieapp = window.setlistjunkieapp || {} , jQuery));
