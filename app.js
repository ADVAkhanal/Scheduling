let chart;

function loadEmpty() {
  const data = {
    labels: [],
    datasets: [{
      label: "Hours",
      data: []
    }]
  };

  const config = {
    type: "bar",
    data: data,
    options: {
      responsive: true
    }
  };

  if (chart) {
    chart.destroy();
  }

  chart = new Chart(document.getElementById("chart"), config);
}

// auto-load empty on start
loadEmpty();
