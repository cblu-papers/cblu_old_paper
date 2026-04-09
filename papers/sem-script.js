
function downloadPaper(event, paperId) {
    // Prevent the default link behavior (i.e., PDF open/download)
    event.preventDefault();

    // Ask the user for confirmation
    const confirmation = confirm(`Do you want to download ${paperId}?`);
    
    if (confirmation) {
        alert(`Downloading ${paperId}...`);
        // Redirect to the PDF file link
        window.location.href = event.target.href;  // This takes the href value from the clicked link
    } else {
        alert('Download canceled.');
    }
}


