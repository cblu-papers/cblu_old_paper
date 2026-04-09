

// Handle search functionality
function handleSearch() {
    const searchInput = document.getElementById('searchInput');
    const searchTerm = searchInput.value.trim().toLowerCase(); // Trim and convert to lowercase
  
    // Redirect based on search term
    if (searchTerm === 'ba') {
      window.location.href = 'papers/ba.html'; // Redirect to BA page
    } else if (searchTerm === 'bca') {
      window.location.href = 'papers/bca.html'; // Redirect to BCA page
    } else if (searchTerm === 'bsc') {
      window.location.href = 'papers/bsc.html'; // Redirect to BSC page
    } else if (searchTerm === 'mca') {
      window.location.href = 'papers/mca.html'; // Redirect to BCA page
    } else if (searchTerm === 'llb') {
      window.location.href = 'papers/llb.html'; // Redirect to BSC page
    } else if (searchTerm === 'llm') {
      window.location.href = 'papers/llm.html'; // Redirect to BCA page
    } else if (searchTerm === 'ma') {
      window.location.href = 'papers/ma.html'; // Redirect to BSC page
    } else if (searchTerm === 'mcom') {
      window.location.href = 'papers/mcom.html'; // Redirect to BCA page
    } else if (searchTerm === 'msc') {
      window.location.href = 'papers/msc.html'; // Redirect to BSC page
    } else if (searchTerm === 'phd') {
      window.location.href = 'papers/phd.html'; // Redirect to BCA page
    } else if (searchTerm === 'bba') {
      window.location.href = 'papers/bba.html'; // Redirect to BSC page
    } else if (searchTerm === 'bed') {
      window.location.href = 'papers/b-ed.html'; // Redirect to BSC page
    } else {
      alert('No results found for: ' + searchInput.value); // Show alert if no match
    }
  }
  
 // Ensure DOM is loaded before attaching the event listeners
document.addEventListener('DOMContentLoaded', function () {
  
    // Search button click event
    document.getElementById('searchButton').addEventListener('click', handleSearch);
  
    // Add enter key support for search
    document.getElementById('searchInput').addEventListener('keypress', function(e) {
      if (e.key === 'Enter') {
        handleSearch();
      }
    });
  });


// window.onscroll = function() {
//     const header = document.querySelector('header');
//     if (window.pageYOffset > 0) {
//         header.classList.add('sticky');
//     } else {
//         header.classList.remove('sticky');
//     }
// };