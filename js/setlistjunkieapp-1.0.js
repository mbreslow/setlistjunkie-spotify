require([
        '$api/models',
        '$api/location#Location',
        '$api/search#Search',
        '$api/toplists#Toplist',
        '$views/buttons',
        '$views/list#List',
        '$views/image#Image'
        ], 
function(models, Location, Search, Toplist, buttons, List, Image) {
	// sequence #
	var nextid = 0;

    // When application has loaded, run pages function
    models.application.load('arguments').done(function(application) {
    	console.log("Application Loaded: ", application);
    });
    
    // Get the currently-playing track
    models.player.load('track').done(updateCurrentTrack);
    
    // Update the DOM when the song changes
    models.player.addEventListener('change:track', function(evt) {
    	updateCurrentTrack(evt.target)
    });

	function updateCurrentTrack(player) {	
		var currentTrack = player.track;
		console.log("Enter updateCurrentTrack: ", currentTrack);
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
        console.log("Querying setlist.fm: ", uri);
        $.getJSON(uri, function(data) {
        	$.each(data.setlists.setlist, function(i, item) {
        		if (item.sets && item.sets.set) {
        			console.log("isArray(item.sets.set): " + isArray(item.sets.set));
        			if (isArray(item.sets.set)) {
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
        })
        .error(function(a) {
        	currentHTML.innerHTML = 'No playlists found for artist ['+artistName+']';
        });
    }
    
       /**
     * Iterates over the Array of song objects in songsArray
     * and creates a Playlist for them
     * @
     */
    function appendPlaylist(playlistModel, playlistDivId, artist, songsArray, externalUrl) {
    	console.log("Appending playlist %s for %s", playlistDivId, artist);
    	console.log(songsArray);
    	if (!songsArray || songsArray.length == 0) {
    		return;
    	}
    	
    	console.log("playlistModel before resolve: ", playlistModel);
    	var setlistPlaylist = playlistModel;
    	setlistPlaylist.resolve('tracks');
    	console.log("setlistPlaylist: ", setlistPlaylist);
    	var fullSetlistListItems = "";
    	
    	// -- create a pipeline of functions to call so we can sequentially
    	//    search for and add the Tracks to a playlist
    	var pipeline = new Array();
    	$.each(songsArray, function(i, item) { 	 
    		var songname = item['@name'];  		
    		pipeline.push(function() {
    			findTrack(artist, songname, function(srchArtist, srchSong, track, searchQuery, searchApi) {
    				console.log("2",track);
    				if (track != null) {
    					console.log("Adding to playlist " + track.toString());
    					setlistPlaylist.tracks.add(track);
    				}
    				else {
    					// -- redo the query with fuzzy match and put it in the front of the Q
    					var missingInfo = "<li>"+srchSong;
    					missingInfo += " [#"+i+"] (not found in Spotify - query " + searchQuery + ") - fuzzy... " + searchApi.fuzzyMatch; 
    					missingInfo += "</li>";    		
    					fullSetlistListItems += missingInfo;			
    				}
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
     * Process a setlistjunkie set
     */
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
		if (set.song && set.song.length > 0) {
			models.Playlist.createTemporary(playlistId+new Date().getTime())
	    		.done(function(playlist) {
					appendPlaylist(playlist, playlistId, artistName, set.song, item.url); 
	    		})
	    		.error(console.error("Unable to create temp playlist"));
	    }
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
    	var playlistView = listViewAPI.forPlaylist(playlist);
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
		var searchResult = Search.search(searchQuery);
		var startItem = 0;
		var numResults  = 1;
		searchResult.tracks.snapshot(startItem,numResults).done(function(snapshot) {
			if (snapshot.length > 0) {
				callback(artist, song, snapshot.get(0), searchQuery, searchResult);
			}
			else if (searchResult.fuzzyMatch) {
				console.log("Searching for track with fuzzyMatch query ["+searchResult.fuzzyMatch+"]");
				var fuzzySearchResult = Search.search(searchResult.fuzzyMatch);
				fuzzySearchResult.tracks.snapshot(startItem,numResults).done(function(snapshot) {
					if (snapshot.length > 0) {
						callback(artist, song, snapshot.get(0), searchResult.fuzzyMatch, fuzzySearchResult);
					}
					else {
						callback(artist, song, null, searchQuery, search);
					}
				});
			}
			else {				
				callback(artist, song, null, searchQuery, search);
			}
		});
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
	
	
	function isArray(obj) {
		return ( Object.prototype.toString.call( obj ) === '[object Array]' );
	}
	
});