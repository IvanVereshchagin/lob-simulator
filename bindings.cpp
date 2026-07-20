#include <pybind11/pybind11.h>
#include <pybind11/stl.h>
#include "OrderBook.h"
#include "SantaFeFlow.h"
#include "HawkesFlow.h"
#include "Metaorder.h"

namespace py = pybind11;

PYBIND11_MODULE(orderbook_cpp, m) {
    py::enum_<Side>(m, "Side")
        .value("Buy", Side::Buy)
        .value("Sell", Side::Sell);

    py::class_<Order>(m, "Order")
        .def(py::init<Side, int, int, int>())
        .def_readwrite("side", &Order::side)
        .def_readwrite("price", &Order::price)
        .def_readwrite("volume", &Order::volume)
        .def_readwrite("id", &Order::id);

    py::class_<OrderBook>(m, "OrderBook")
        .def(py::init<>())
        .def("bestBid", &OrderBook::bestBid)
        .def("bestAsk", &OrderBook::bestAsk)
        .def("addLimitOrder", &OrderBook::addLimitOrder)
        .def("processOrder", &OrderBook::processOrder)
        .def("cancelOrder", &OrderBook::cancelOrder)
        .def("bidDepth", &OrderBook::bidDepth)
        .def("askDepth", &OrderBook::askDepth)
        .def_readonly("orderLocation", &OrderBook::orderLocation);

    py::enum_<EventType>(m, "EventType")
    .value("NewLimitOrder", EventType::NewLimitOrder)
    .value("NewMarketOrder", EventType::NewMarketOrder)
    .value("Cancel", EventType::Cancel);

    py::class_<Event>(m, "Event")
        .def_readwrite("type", &Event::type)
        .def_readwrite("side", &Event::side)
        .def_readwrite("price", &Event::price)
        .def_readwrite("volume", &Event::volume)
        .def_readwrite("id", &Event::id);

    py::class_<SantaFeFlow>(m, "SantaFeFlow")
        .def(py::init<double, double, double, int, int, int, int, double>(),
            py::arg("l"), py::arg("m"), py::arg("n"),
            py::arg("minP"), py::arg("maxP"),
            py::arg("minVolume"), py::arg("maxVolume"),
            py::arg("rho") = 0.0)
        .def("nextEvent", &SantaFeFlow::nextEvent, py::arg("midPrice"));

    py::class_<HawkesFlow>(m, "HawkesFlow")
        .def(py::init<double, double, double, int, int, int, int, double>(),
            py::arg("phi0"), py::arg("branchingRatio"), py::arg("decayRate"),
            py::arg("minP"), py::arg("maxP"),
            py::arg("minVolume"), py::arg("maxVolume"),
            py::arg("rho") = 0.0)
        .def("nextEvent", &HawkesFlow::nextEvent, py::arg("midPrice"));

    py::class_<MetaorderExecutor>(m, "MetaorderExecutor")
        .def(py::init<Side, int, int, int>())
        .def("isFinished", &MetaorderExecutor::isFinished)
        .def("nextChildOrder", &MetaorderExecutor::nextChildOrder)
        .def("getExecutedSoFar", &MetaorderExecutor::getExecutedSoFar)
        .def("getTotalChildOrders", &MetaorderExecutor::getTotalChildOrders);

    
}